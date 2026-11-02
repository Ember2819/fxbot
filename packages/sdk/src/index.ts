import type { FxResumeTurn, FxSessionPromptInput, FxTurn } from "libfx";
import { createArchives } from "./archive.ts";
import { createHistory, summarize } from "./history.ts";
import { createLibrary } from "./library.ts";
import { createMcp } from "./mcp.ts";
import { createProviders } from "./providers.ts";
import { createRegistry } from "./registry.ts";
import { createReleases } from "./releases.ts";
import { readKey } from "./secrets.ts";
import { createSkills } from "./skills.ts";
import { createStore, isId, type StoredProfile } from "./store.ts";
import { colors, maxPinned, shapes, type Addon, type AddonRef, type AddonSecrets, type Fields, type Kind, type LibraryQuery, type Message, type NewProvider, type Profile, type ProfileUpdate, type ProviderUpdate, type Settings, type StreamLine, type SkillRef, type Upload } from "./types.ts";

export type * from "./types.ts";
export { colors, itemKinds, kinds, maxPinned, shapes } from "./types.ts";
export { readKey, rotateSecrets } from "./secrets.ts";
export { compareVersions, isStable, isVersion, releasesUrlFor } from "./releases.ts";

export type FxbotOptions = {
  /** fxbot's Postgres. Every record lives there, and keys and tokens only sealed. */
  databaseUrl: string;
  /** 32 bytes that seal the keys and tokens: a Buffer, or the base64 text of the key file. */
  secretKey: Buffer | string;
  /** fxbot's Vercel OAuth app, for signing in with a Vercel account. */
  vercelClientId?: string;
  /** libfx's sessions. Default `data`. */
  dataDir?: string;
  /** Where a backup goes before migrations run: the database and `dataDir`. Default `backups`. */
  backupsDir?: string;
  /** The running version, from the root package.json. */
  version?: string;
  /** Where the newest stable release is read, in the shape of GitHub's `releases/latest`. None: no check. */
  releasesUrl?: string;
  /** For sign-ins, model lists, key checks, and MCP servers; replaced in checks. */
  fetch?: typeof fetch;
  /** The server's own origin on this machine, for MCP sign-ins with a loopback redirect. Default `http://127.0.0.1:8787`. */
  localUrl?: string;
  /** The project's published client ID metadata document, for MCP sign-ins that use one. */
  clientMetadataUrl?: string;
  /** The MCP registry that registry entries come from, mirrored hourly for search. Default GitHub's, `https://api.mcp.github.com`. */
  registryUrl?: string;
  /** The official MCP registry, searched only when asked to search everything. Default `https://registry.modelcontextprotocol.io`. */
  everythingUrl?: string;
  /** The site that publishes fxbot's own lists, `mcp-registry.json` and `skills-registry.json`, read hourly. Without it, the lists this release shipped with. */
  listsUrl?: string;
  /** Mirror the registry at start and hourly. Default true; checks turn it off and sync by hand. */
  syncRegistry?: boolean;
};

// Bad input fails with `status` 400 and a missing bot with 404, so a server can answer with the same status.
const fail = (status: 400 | 404 | 502, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
// A skill is named by its skills.sh id; a server by its address or its registry entry.
const isSkill = (ref: AddonRef): ref is SkillRef => typeof (ref as SkillRef | undefined)?.skill === "string";

// libfx's limits for one prompt's images.
const maxImage = 3.75 * 2 ** 20;
const maxImages = 6 * 2 ** 20;

// Create needs only a name; the rest start empty, and the look a brown circle. Update takes any of them. Other keys
// are ignored.
function fields(input: Partial<Fields>, create: boolean): Partial<Fields> {
  const out: Partial<Fields> = create ? { instructions: "", model: "", provider: "", shape: "circle", color: "brown" } : {};
  for (const key of ["name", "instructions", "model", "provider"] as const) {
    const value: unknown = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return fail(400, `${key} must be a string`);
    out[key] = key === "instructions" ? value : value.trim();
    if (key !== "instructions" && out[key]!.length > 200) fail(400, `${key} is over 200 characters`);
  }
  if (input.shape !== undefined) out.shape = shapes.includes(input.shape) ? input.shape : fail(400, `shape must be one of ${shapes.join(", ")}`);
  if (input.color !== undefined) out.color = input.color in colors ? input.color : fail(400, `color must be one of ${Object.keys(colors).join(", ")}`);
  if ((create || out.name !== undefined) && !out.name) fail(400, "name is required");
  if (Buffer.byteLength(out.instructions ?? "") > 64 * 1024) fail(400, "instructions are over 64 KiB");
  return out;
}

// Postgres for the records, one libfx agent per provider over a shared sessions directory, and a durable chat with
// each bot. Turns a stopped process left open run again at once.
export async function createFxbot(options: FxbotOptions) {
  const { databaseUrl, secretKey, vercelClientId, dataDir = "data", backupsDir = "backups", version = "0.0.0", fetch = globalThis.fetch } = options;
  const key = typeof secretKey === "string" ? readKey(secretKey) : secretKey;
  const store = await createStore({ databaseUrl, dataDir, backupsDir });
  const releases = createReleases({ version, url: options.releasesUrl, fetch });
  const history = createHistory(store.sql);
  const library = createLibrary(store.sql);
  // MCP servers' tools join every agent, and the skill tool once there are skills. A change to them makes the agents
  // again, one change at a time.
  const registryUrl = options.registryUrl ?? "https://api.mcp.github.com";
  const everythingUrl = options.everythingUrl ?? "https://registry.modelcontextprotocol.io";
  const lists = options.listsUrl?.replace(/\/+$/, "");
  const registry = createRegistry({
    sql: store.sql,
    fetch,
    mirrorUrl: registryUrl,
    everythingUrl,
    ...(lists ? { fxbotUrl: `${lists}/mcp-registry.json`, fxbotSkillsUrl: `${lists}/skills-registry.json` } : {}),
  });
  if (options.syncRegistry !== false) void registry.sync();
  const mcp = await createMcp({
    store,
    secretKey: key,
    fetch,
    localUrl: options.localUrl ?? "http://127.0.0.1:8787",
    clientMetadataUrl: options.clientMetadataUrl,
    findEntry: registry.lookup,
    onChange: () => void retool(),
  });
  const skills = await createSkills({
    store,
    archives: createArchives({ fetch }),
    fromOf: (skill) => (registry.ourSkill(skill) ? "fxbot" : "skills.sh"),
    onChange: () => void retool(),
  });
  const toolsNow = async () => [history.tool, ...library.tools, ...(skills.any() ? [skills.tool] : []), ...(await mcp.tools())];
  const providers = await createProviders({ store, secretKey: key, dataDir, vercelClientId, fetch, tools: await toolsNow() });
  let retooling = Promise.resolve();
  function retool() {
    retooling = retooling.then(async () => providers.retool(await toolsNow())).catch((error) => console.error("Could not give the agents their new tools:", error));
    return retooling;
  }
  mcp.connect();

  // How many turns each bot has running in this process, for `busy`.
  const running = new Map<string, number>();
  const count = (id: string, by: number) => running.set(id, (running.get(id) ?? 0) + by);
  const withBusy = (profile: StoredProfile): Profile => ({ ...profile, busy: (running.get(profile.id) ?? 0) > 0 });

  // A switch's summary follows the bot's own instructions in every open of the chat it started.
  const instructionsFor = (profile: StoredProfile) =>
    [profile.instructions, profile.handoff ? `${profile.handoff}\n\nSearch earlier messages with chat_history.` : ""].filter(Boolean);

  async function modelFor(profile: StoredProfile) {
    if (!profile.provider) return fail(400, "This bot has no provider. Add one in Settings, then pick it in the bot's settings.");
    return profile.model || (await providers.get(profile.provider)).model;
  }

  // libfx keeps no model or instructions for a session, so every open passes them, and the bot for chat_history and
  // skill. The bot's skills follow its instructions, in 1% of the model's context window, at 4 characters a token, or
  // 8,000 characters when the window is unknown.
  async function open(profile: StoredProfile, sessionId: string) {
    const model = await modelFor(profile);
    const agent = await providers.agentFor(profile.provider, model);
    const window = skills.countFor(profile.id) ? await providers.contextWindow(profile.provider, model).catch(() => undefined) : undefined;
    const catalog = skills.catalog(profile.id, window ? Math.floor(window * 0.01 * 4) : 8000);
    return agent.session(sessionId, { model: model || undefined, instructions: [...instructionsFor(profile), catalog].filter(Boolean), context: { bot: profile.id } });
  }

  async function get(id: string) {
    if (!isId(id)) fail(400, "profile id must be 12 hex characters");
    return (await store.profiles.get(id)) ?? fail(404, "profile not found");
  }

  async function provider(id: string) {
    if (id) await providers.get(id);
    return id;
  }

  // A message's files as libfx prompt blocks: images as images that name their library item, and each text file as
  // text under its name, the way libfx hands the model a resource. libfx counts a prompt of resources alone as empty.
  // Every file is checked against libfx's limits before any is saved; then each goes into the library, tagged for the
  // bot and its chat. The record is saved before the prompt, so the stream finds it when the turn starts.
  // A message with files or named skills is blocks: its text, each skill's instructions, then each file. What it sent
  // is kept, since libfx's stream shows only a plain-text prompt.
  async function attach(profile: StoredProfile, text: string, messageId: string, files: Upload[], skilled: ReturnType<typeof skills.invoked>): Promise<FxSessionPromptInput> {
    const checked = files.map(({ name, type, data }) => {
      if (typeof name !== "string" || typeof type !== "string" || typeof data !== "string") return fail(400, "each file needs a name, a type, and base64 data");
      const bytes = Buffer.from(data, "base64");
      return { name, bytes, ...library.check({ name, type, bytes }) };
    });
    const images = checked.filter((file) => file.kind === "image");
    if (images.some((file) => file.bytes.length > maxImage)) fail(400, "An image can be at most 3.75 MiB.");
    if (images.reduce((sum, file) => sum + file.bytes.length, 0) > maxImages) fail(400, "A message's images can be at most 6 MiB together.");
    const blocks: Exclude<FxSessionPromptInput, string>[number][] = [...(text.trim() ? [{ type: "text" as const, text }] : []), ...skilled];
    const sent: Upload[] = [];
    for (const { name, type, bytes, kind, text: content } of checked) {
      const item = await library.save({ profileId: profile.id, sessionId: profile.sessionId!, origin: "uploaded", name, type, bytes });
      blocks.push(kind === "image" ? { type: "image", mimeType: type, data: bytes.toString("base64"), sourceRef: `library:${item.id}` } : { type: "text", text: `File: ${name}\n${content}` });
      sent.push({ name, type, url: item.url });
    }
    await store.sent.save(profile.id, messageId, { input: text, files: sent });
    return blocks;
  }

  // Reading a turn's events waits for its end; a repeated messageId yields no text and saves nothing. A resumed turn
  // learns its messageId from its events, and one with nothing left open has none.
  async function finish(id: string, sessionId: string, turn: FxTurn | FxResumeTurn) {
    let reply = "";
    count(id, 1);
    try {
      for await (const event of turn) if (event.type === "text_delta") reply += event.delta;
    } catch {
      return;
    } finally {
      count(id, -1);
    }
    if (!reply.trim() || !turn.messageId) return;
    await history.record(id, sessionId, turn.messageId, "assistant", reply);
    await store.profiles.update(id, { preview: reply.trim().replace(/\s+/g, " ").slice(0, 160) });
  }

  // libfx's turn_start carries a prompt only when it was plain text, so the saved one goes back in.
  function withSent(id: string) {
    let rest = "";
    const fill = async (part: string) => {
      const line: StreamLine | null = part.includes('"turn_start"') ? JSON.parse(part) : null;
      const sent = line?.type === "turn_start" && line.input === undefined && (await store.sent.get(id, line.messageId!));
      return (sent ? JSON.stringify({ ...line, ...sent }) : part) + "\n";
    };
    return new TransformStream<string, string>({
      async transform(chunk, out) {
        const parts = (rest + chunk).split("\n");
        rest = parts.pop()!;
        for (const part of parts) out.enqueue(await fill(part));
      },
      flush: (out) => (rest ? out.enqueue(rest) : undefined),
    });
  }

  async function lines(profile: StoredProfile, cursor: number) {
    return (await open(profile, profile.sessionId!))
      .stream(cursor)
      .pipeThrough(new TextDecoderStream() as TransformStream<Uint8Array, string>)
      .pipeThrough(withSent(profile.id));
  }

  // A provider switch compacts the chat: the old provider summarizes its own session, or else the new one summarizes
  // the stored messages. The new session on the new provider starts from that summary.
  async function switchProvider(profile: StoredProfile, next: string, model: string) {
    const [from, to] = [await providers.get(profile.provider).catch(() => null), await providers.get(next)];
    const previous = profile.handoff ? [profile.handoff] : [];
    let summary: string;
    try {
      if (!from) throw new Error("the old provider is gone");
      const oldModel = await modelFor(profile);
      const checkpoint = await (await providers.agentFor(from.id, oldModel)).session(profile.sessionId!).checkpoint();
      summary = await summarize(await providers.options(from), oldModel, instructionsFor(profile), checkpoint);
    } catch {
      const newModel = model || to.model || fail(400, `Pick a model for ${to.name} first: the old provider could not summarize the chat.`);
      const known = (await providers.models(to.id).catch(() => [])).find((m) => m.id === newModel);
      const transcript = await history.transcript(profile.id, profile.sessionId!, ((to.contextWindow ?? known?.contextWindow ?? 32_000) * 4) / 2);
      summary = await summarize(await providers.options(to), newModel, [profile.instructions].filter(Boolean), undefined, [...previous, transcript].join("\n\n"))
        .catch((error: Error) => fail(502, `Neither provider could summarize the chat for the switch: ${error.message}`));
    }
    const handoff = `Earlier conversation, summarized when this bot moved from ${from?.name ?? "a removed provider"} to ${to.name}:\n\n${summary}`;
    const sessionId = await (await providers.agentFor(to.id, "")).newSessionId();
    return (await store.profiles.update(profile.id, { provider: next, model, sessionId, handoff }))!;
  }

  // A turn left open by a process that died waits for the session's next prompt unless resumed.
  for (const profile of await store.profiles.list()) {
    if (!profile.sessionId || !providers.has(profile.provider)) continue;
    const session = await open(profile, profile.sessionId).catch(() => null);
    if (session) void finish(profile.id, profile.sessionId, session.resume());
  }

  return {
    profiles: {
      list: async () => (await store.profiles.list()).map(withBusy),
      get: async (id: string) => withBusy(await get(id)),
      async create(input: Partial<Fields>) {
        const values = fields(input, true) as Fields;
        values.provider = await provider(values.provider || (await store.settings.get()).defaultProvider);
        return withBusy(await store.profiles.create(values));
      },
      // A new provider for a bot with a chat runs the switch. A new provider without a new model follows its default.
      async update(id: string, input: ProfileUpdate) {
        const profile = await get(id);
        if (input.pinned !== undefined) {
          if (typeof input.pinned !== "boolean") fail(400, "pinned must be true or false");
          if (!(await store.profiles.pin(id, input.pinned))) fail(400, `Up to ${maxPinned} bots can be pinned. Unpin one first.`);
        }
        const { provider: next, ...values } = fields(input, false);
        if (next === undefined || next === profile.provider) return withBusy((await store.profiles.update(id, values))!);
        await provider(next);
        if (!next && profile.sessionId) fail(400, "A bot with a chat needs a provider. Pick another one instead.");
        const model = values.model ?? "";
        const saved = (await store.profiles.update(id, { ...values, model: profile.model }))!;
        return withBusy((await (profile.sessionId ? switchProvider(saved, next, model) : store.profiles.update(id, { provider: next, model })))!);
      },
      async remove(id: string) {
        await get(id);
        await store.profiles.remove(id);
      },
      // The bot's skills, for the $ and / picker in its chat.
      skills: async (id: string) => (await get(id), skills.listFor(id)),
      // The bot's chats before its current one, which a provider switch leaves behind.
      async earlier(id: string) {
        const profile = await get(id);
        return history.earlier(id, profile.sessionId);
      },
    },

    settings: {
      get: store.settings.get,
      async update({ defaultProvider }: Settings) {
        if (typeof defaultProvider !== "string") fail(400, "defaultProvider must be a string");
        return store.settings.save({ defaultProvider: await provider(defaultProvider.trim()) });
      },
    },

    providers: {
      list: () => providers.list(),
      add: (input: NewProvider) => providers.add(input),
      update: (id: string, input: ProviderUpdate) => providers.update(id, input),
      remove: (id: string) => providers.remove(id),
      models: (id: string) => providers.models(id),
      teams: (id: string) => providers.teams(id),
    },

    signIns: {
      start: (input: { kind: Kind; provider?: string }) => providers.signIns.start(input ?? {}),
      get: (id: string) => providers.signIns.get(id),
      cancel: (id: string) => providers.signIns.cancel(id),
    },

    // Resolves once libfx has stored the prompt; the reply arrives on the stream. libfx takes at most 8 images,
    // 3.75 MiB each and 6 MiB together.
    async send(id: string, { text, messageId, files = [] }: Message) {
      let profile = await get(id);
      if (!Array.isArray(files) || files.length > 8) fail(400, "files must be a list of at most 8");
      if (typeof text !== "string" || (!text.trim() && !files.length)) fail(400, "text is required");
      if (typeof messageId !== "string" || !/^[\w.-]{1,128}$/.test(messageId))
        fail(400, "messageId must be 1 to 128 letters, digits, '.', '_', or '-'");
      if (!(await modelFor(profile))) fail(400, "No model. Pick a default model for this bot's provider in Settings, or give the bot one.");
      // Saved before the prompt, so a restart still finds the session and every upload knows its chat. A concurrent
      // first send keeps the id already saved.
      if (!profile.sessionId) profile = (await store.profiles.claimSession(id, await (await providers.agentFor(profile.provider, "")).newSessionId())) ?? fail(404, "profile not found");
      // A skill named as $name, or /name at the start, goes with the message, so the bot has it without asking.
      const skilled = skills.invoked(id, text);
      const input = files.length || skilled.length ? await attach(profile, text, messageId, files, skilled) : text;
      try {
        // A messageId the session already accepted runs nothing new and resolves to the same ids.
        const turn = (await open(profile, profile.sessionId!)).prompt(input, { messageId });
        const accepted = await turn.accepted;
        const names = files.length ? `\n[files: ${files.map((f) => f.name).join(", ")}]` : "";
        await history.record(id, accepted.sessionId, messageId, "user", text + names);
        void finish(id, accepted.sessionId, turn);
        return accepted;
      } catch (error) {
        // libfx throws a TypeError or RangeError for a prompt it refuses, such as an image whose bytes are not its type.
        throw error instanceof TypeError || error instanceof RangeError ? Object.assign(error, { status: 400 }) : error;
      }
    },

    // Every line of the bot's chat from `cursor` on as NDJSON, staying open for new ones. Cancel it to stop.
    // A bot with no session yet, or whose provider is gone, has nothing to replay, so its stream ends at once.
    async stream(id: string, cursor = 0): Promise<ReadableStream<Uint8Array>> {
      const profile = await get(id);
      if (!Number.isInteger(cursor) || cursor < 0) fail(400, "cursor must be a whole number");
      if (!profile.sessionId || !providers.has(profile.provider)) return new ReadableStream({ start: (controller) => controller.close() });
      return (await lines(profile, cursor)).pipeThrough(new TextEncoderStream());
    },

    // Every bot's files in one place. `file` and `upload` (an image's URL from before the library) return the bytes,
    // or null bytes when `ifNoneMatch` already names them.
    library: {
      list: (query: LibraryQuery) => library.list(query),
      get: (id: string) => library.get(id),
      file: (id: string, ifNoneMatch?: string) => library.file(id, ifNoneMatch),
      upload: (id: string, name: string, ifNoneMatch?: string) => (isId(id) ? library.upload(name, ifNoneMatch) : fail(404, "not found")),
      remove: (id: string) => library.remove(id),
    },

    // Remote MCP servers and skills. Adding one takes the `hash` its preview showed, and fails if it changed since.
    // Secrets are write-only; a listed add-on says only whether it holds them.
    addons: {
      // With what the registry says about each server now: its details, and a mark when it has a newer version, or is
      // deprecated or gone. Skills carry their marks from the hourly check of their repositories.
      list: async (): Promise<Addon[]> => [...(await registry.decorate(await mcp.list())), ...skills.list()],
      // fxbot's list and GitHub's registry, and with `everything`, the official one's own search too. Skills: fxbot's
      // skills list, then skills.sh's.
      search: (q: unknown, options: { kind?: unknown; everything?: boolean }) => (options.kind === "skill" ? registry.searchSkills(q) : registry.search(q, options)),
      preview: (ref: AddonRef) => (isSkill(ref) ? skills.preview(ref) : mcp.preview(ref)),
      add: (ref: AddonRef, hash: string) => (isSkill(ref) ? skills.add(ref, hash) : mcp.add(ref, hash)),
      update: (id: string, hash: unknown) => (skills.has(id) ? skills.update(id, hash) : mcp.update(id, hash)),
      change: (id: string, input: { enabled?: boolean; bots?: "all" | "each"; allowed?: string[] }) => (skills.has(id) ? skills.change(id, input) : mcp.change(id, input)),
      remove: (id: string) => (skills.has(id) ? skills.remove(id) : mcp.remove(id)),
      setSecrets: (id: string, input: AddonSecrets) => mcp.setSecrets(id, input),
      // A bot's switch, read when the add-on is chosen bot by bot.
      async forBot(profileId: string, addonId: string, enabled: boolean) {
        await get(profileId);
        return skills.has(addonId) ? skills.forBot(profileId, addonId, enabled) : mcp.forBot(profileId, addonId, enabled);
      },
      // One of an installed skill's files, to read on its page.
      readSkill: (id: string, file: unknown) => skills.read(id, file),
      // Checks the skills' repositories now, as the hourly check does, and marks what changed there.
      check: () => skills.check(),
    },

    // OAuth sign-in to an MCP server: start with the page's origin, then poll. The browser comes back to that origin's
    // `/api/oauth/callback`, or the person pastes the address of the page a loopback redirect could not load.
    oauth: mcp.oauth,

    // The running version, and the newest stable release when it is newer.
    release: releases.get,

    // Waits for the turns this process started, then lets Postgres go.
    async close() {
      releases.close();
      registry.close();
      skills.close();
      await mcp.close();
      await providers.close();
      await store.close();
    },
  };
}

export type Fxbot = Awaited<ReturnType<typeof createFxbot>>;
