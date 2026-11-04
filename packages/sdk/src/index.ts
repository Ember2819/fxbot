import type { FxResumeTurn, FxSessionPromptInput, FxTurn } from "libfx";
import { createArchives } from "./archive.ts";
import { createEmbeddings, type EmbeddingSettings } from "./embeddings.ts";
import { createHistory, summarize } from "./history.ts";
import { createLibrary } from "./library.ts";
import { createMcp } from "./mcp.ts";
import { createMemories } from "./memories.ts";
import type { PluginMachine } from "./plugin-api.ts";
import { createPlugins } from "./plugins.ts";
import { createProviders } from "./providers.ts";
import { createRegistry } from "./registry.ts";
import { createReleases } from "./releases.ts";
import { openSessions } from "./sessions.ts";
import { readKey } from "./secrets.ts";
import { createSkills } from "./skills.ts";
import { createStore, isId, type StoredProfile } from "./store.ts";
import { colors, maxPinned, shapes, type Plugin, type PluginRef, type RepoRef, type PluginSecrets, type Fields, type Kind, type LibraryQuery, type Message, type NewProvider, type Profile, type ProfileUpdate, type ProviderUpdate, type Settings, type StreamLine, embeddingKinds, type SkillRef, type Upload } from "./types.ts";

export type * from "./types.ts";
export type * from "./plugin-api.ts";
export { colors, embeddingKinds, itemKinds, kinds, maxPinned, shapes } from "./types.ts";
export { readKey, rotateSecrets } from "./secrets.ts";
export { compareVersions, isStable, isVersion, releasesUrlFor } from "./releases.ts";

export type FxbotOptions = {
  /** fxbot's Postgres. Every record lives there, and keys and tokens only sealed. */
  databaseUrl: string;
  /** 32 bytes that seal the keys and tokens: a Buffer, or the base64 text of the key file. */
  secretKey: Buffer | string;
  /** fxbot's Vercel OAuth app, for signing in with a Vercel account. */
  vercelClientId?: string;
  /** Plugins' files, and libfx's sessions from before 0.4.0, which move into Postgres on the first start. Default `data`. */
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
  /** The site that publishes fxbot's own lists, `mcp-registry.json` and `skills-registry.json`, read hourly. Default fxbot's, `https://fxbot.sh`. Until a read succeeds, the lists this release shipped with. */
  listsUrl?: string;
  /** Mirror the registry at start and hourly. Default true; checks turn it off and sync by hand. */
  syncRegistry?: boolean;
  /** The machine's local embedder, an OpenAI-style API such as `http://embed:8080/v1`, for memory search. None: no local embedder. */
  embedUrl?: string;
  /** Plugin folders to load at start, unpinned, for writing a plugin in a checkout. */
  pluginDirs?: string[];
  /** The machine's fxbot command, which does a job only root can do when a plugin asks. None in a checkout. */
  machine?: PluginMachine;
};

// Bad input fails with `status` 400 and a missing bot with 404, so a server can answer with the same status.
const fail = (status: 400 | 404 | 409 | 502, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
// A skill is named by its skills.sh id; a server by its address or its registry entry.
const isSkill = (ref: PluginRef): ref is SkillRef => typeof (ref as SkillRef | undefined)?.skill === "string";
// A plugin by its GitHub repository and folder.
const isRepo = (ref: PluginRef): ref is RepoRef => typeof (ref as RepoRef | undefined)?.repo === "string";

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

// Postgres for the records and libfx's sessions, one libfx agent per provider, and a durable chat with each bot. Turns a stopped process left open run again at once.
export async function createFxbot(options: FxbotOptions) {
  const { databaseUrl, secretKey, vercelClientId, dataDir = "data", backupsDir = "backups", version = "0.0.0", fetch = globalThis.fetch } = options;
  const key = typeof secretKey === "string" ? readKey(secretKey) : secretKey;
  const store = await createStore({ databaseUrl, dataDir, backupsDir });
  const sessions = await openSessions(store.sql, { databaseUrl, dataDir, backupsDir, backedUp: store.backedUp }).catch(async (error) => {
    await store.close();
    throw error;
  });
  // How many turns each bot has running in this process, for `busy`.
  const running = new Map<string, number>();
  const count = (id: string, by: number) => running.set(id, (running.get(id) ?? 0) + by);
  const withBusy = (profile: StoredProfile): Profile => ({ ...profile, busy: (running.get(profile.id) ?? 0) > 0 });
  const releases = createReleases({ version, url: options.releasesUrl, fetch });
  // Memory search's vectors: from the machine's local embedder, a provider's /embeddings, or none.
  const embeddings = createEmbeddings({ sql: store.sql, fetch, localUrl: options.embedUrl?.replace(/\/+$/, ""), target: (id) => providers.embeddingsTarget(id) });
  const history = createHistory(store.sql, embeddings);
  const memories = createMemories(store.sql, embeddings);
  const library = createLibrary(store.sql);
  // MCP servers' tools join every agent, and the skill tool once there are skills. A change to them makes the agents
  // again, one change at a time.
  const registryUrl = options.registryUrl ?? "https://api.mcp.github.com";
  const everythingUrl = options.everythingUrl ?? "https://registry.modelcontextprotocol.io";
  const lists = (options.listsUrl ?? "https://fxbot.sh").replace(/\/+$/, "");
  const registry = createRegistry({
    sql: store.sql,
    fetch,
    mirrorUrl: registryUrl,
    everythingUrl,
    fxbotUrl: `${lists}/mcp-registry.json`,
    fxbotSkillsUrl: `${lists}/skills-registry.json`,
    fxbotPluginsUrl: `${lists}/plugins-registry.json`,
    // GitHub's registry is mirrored while unvetted plugins show, or while a server from it is installed, for its marks.
    mirrorWanted: async () =>
      (await store.settings.get()).unvetted ||
      (await store.plugins.list()).some((p) => p.kind === "mcp" && typeof (p.source as { registry?: unknown })?.registry === "string" && ((p.source as { from?: string }).from ?? "github") === "github"),
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
    reserved: () => packages.names(),
  });
  const archives = createArchives({ fetch });
  const skills = await createSkills({
    store,
    archives,
    fromOf: (skill) => (registry.ourSkill(skill) ? "fxbot" : "skills.sh"),
    onChange: () => void retool(),
    carried: () => packages.carried(),
  });
  // Plugins load before the agents, so their tools are there from the start. Every tool passes through their hooks.
  // A plugin that starts turns from its setup is told to wait: the agents come after it.
  let ready = false;
  const started = () => ready || fail(400, "fxbot is still starting. Start turns after setup.");
  const packages = await createPlugins({
    store,
    databaseUrl,
    secretKey: key,
    dataDir,
    archives,
    dirs: options.pluginDirs ?? [],
    taken: () => mcp.prefixes(),
    onChange: () => void retool(),
    host: {
      bots: { list: async () => (await store.profiles.list()).map(withBusy), get: async (id) => withBusy(await get(id)) },
      library: {
        read: (bot, id) => library.readFor(bot, id),
        save: ({ bot, session, name, type, bytes }) => library.save({ profileId: bot, sessionId: session, origin: "generated", name, type, bytes }),
      },
      skills: { files: (bot, name) => skills.files(bot, name) },
      machine: options.machine ?? null,
      chats: {
        async newSession(plugin, bot) {
          started();
          const profile = await get(bot);
          if (!profile.provider) fail(400, "This bot has no provider.");
          const id = await (await providers.agentFor(profile.provider, "")).newSessionId();
          await store.sql`insert into plugin_sessions (id, profile_id, provider, plugin) values (${id}, ${bot}, ${profile.provider}, ${plugin})`;
          return id;
        },
        send: async (plugin, bot, { text, files, session, messageId = crypto.randomUUID() }) =>
          (started(), deliver(bot, { text, files, messageId }, { session, from: plugin })),
        async stream(plugin, bot, session, cursor = 0) {
          started();
          const profile = await get(bot);
          await pluginSession(plugin, profile, session);
          if (!Number.isInteger(cursor) || cursor < 0) fail(400, "cursor must be a whole number");
          return (await lines(profile, session, cursor)).pipeThrough(new TextEncoderStream());
        },
      },
      async addServer({ url, headers, transport, allowLocal }) {
        const ref = { url, headers, allowLocal, ...(transport ? { transport } : {}) };
        return (await mcp.add(ref, (await mcp.preview(ref)).hash)).id;
      },
      changeServer: (id, input) => mcp.change(id, input),
      serverForBot: (profileId, id, enabled) => mcp.forBot(profileId, id, enabled),
      removeServer: (id) => mcp.remove(id),
    },
  });
  await packages.start();
  const toolsNow = async () =>
    [history.tool, ...memories.tools, ...library.tools, ...(skills.any() ? [skills.tool] : []), ...(await mcp.tools()), ...packages.tools()].map(packages.wrap);
  const providers = await createProviders({ store, secretKey: key, durability: sessions.durability, vercelClientId, fetch, tools: await toolsNow() });
  // Vectors that rows lack, from where Settings says, in the background.
  embeddings.nudge();
  let retooling = Promise.resolve();
  // Before the agents start, their tools are read when they're made.
  function retool() {
    if (!ready) return Promise.resolve();
    retooling = retooling.then(async () => providers.retool(await toolsNow())).catch((error) => console.error("Could not give the agents their new tools:", error));
    return retooling;
  }
  mcp.connect();
  ready = true;

  // A switch's summary follows the bot's own instructions in every open of the chat it started.
  const instructionsFor = (profile: StoredProfile) =>
    [profile.instructions, profile.handoff ? `${profile.handoff}\n\nSearch earlier messages with chat_history.` : ""].filter(Boolean);

  async function modelFor(profile: StoredProfile) {
    if (!profile.provider) return fail(400, "This bot has no provider. Add one in Settings, then pick it in the bot's settings.");
    return profile.model || (await providers.get(profile.provider)).model;
  }

  // libfx keeps no model or instructions for a session, so every open passes them, and the bot for its tools. After the
  // bot's own instructions come its memories, in 2% of the model's context window, and its skills, in 1%, at 4
  // characters a token, or 8,000 characters each when the window is unknown. libfx takes at most 64 KiB in all, so the
  // memories get no more than what the rest leaves. They change only when a memory does, so the prompt cache holds.
  // Plugins' instructions hooks change the list last.
  async function open(profile: StoredProfile, sessionId: string) {
    const model = await modelFor(profile);
    const agent = await providers.agentFor(profile.provider, model);
    const window = await providers.contextWindow(profile.provider, model).catch(() => undefined);
    const share = (part: number) => (window ? Math.floor(window * part * 4) : 8000);
    const catalog = skills.catalog(profile.id, share(0.01));
    const room = 64 * 1024 - 1024 - Buffer.byteLength([...instructionsFor(profile), catalog].join("\n\n"));
    const memory = await memories.section(profile.id, Math.min(share(0.02), room));
    let instructions = [...instructionsFor(profile), memory, catalog].filter(Boolean);
    if (packages.hooked("instructions")) {
      const event = { bot: profile.id, session: sessionId, instructions };
      await packages.run("instructions", event);
      instructions = (Array.isArray(event.instructions) ? event.instructions : []).filter((entry) => typeof entry === "string" && entry);
    }
    return agent.session(sessionId, { model: model || undefined, instructions, context: { bot: profile.id } });
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
  async function attach(profile: StoredProfile, sessionId: string, text: string, messageId: string, files: Upload[], skilled: ReturnType<typeof skills.invoked>, from?: string): Promise<FxSessionPromptInput> {
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
      const item = await library.save({ profileId: profile.id, sessionId, origin: "uploaded", name, type, bytes });
      blocks.push(kind === "image" ? { type: "image", mimeType: type, data: bytes.toString("base64"), sourceRef: `library:${item.id}` } : { type: "text", text: `File: ${name}\n${content}` });
      sent.push({ name, type, url: item.url });
    }
    await store.sent.save(profile.id, messageId, { input: text, files: sent, plugin: from });
    return blocks;
  }

  // Each turn's reply is saved after the turn ends, and close waits for the saves.
  const saving = new Set<Promise<void>>();
  function finish(id: string, sessionId: string, turn: FxTurn | FxResumeTurn, sent: { text: string; from?: string } = { text: "" }) {
    const done = saveReply(id, sessionId, turn, sent).catch((error) => console.error("Could not save a reply:", error));
    saving.add(done);
    void done.finally(() => saving.delete(done));
  }

  // Reading a turn's events waits for its end; a repeated messageId yields no text and saves nothing. A resumed turn
  // learns its messageId from its events, and one with nothing left open has none. Plugins hear the end either way.
  async function saveReply(id: string, sessionId: string, turn: FxTurn | FxResumeTurn, sent: { text: string; from?: string }) {
    let reply = "";
    count(id, 1);
    try {
      for await (const event of turn) if (event.type === "text_delta") reply += event.delta;
    } catch (error) {
      if (turn.messageId) packages.observe("turn.end", { bot: id, session: sessionId, messageId: turn.messageId, ...sent, reply, error: (error as Error).message });
      return;
    } finally {
      count(id, -1);
    }
    if (turn.messageId) packages.observe("turn.end", { bot: id, session: sessionId, messageId: turn.messageId, ...sent, reply });
    if (!reply.trim() || !turn.messageId) return;
    await history.record(id, sessionId, turn.messageId, "assistant", reply);
    // A reply in a plugin's session isn't the bot's own chat's.
    if ((await store.profiles.get(id))?.sessionId === sessionId) await store.profiles.update(id, { preview: reply.trim().replace(/\s+/g, " ").slice(0, 160) });
  }

  // libfx's turn_start carries a prompt only when it was plain text, so the saved one goes back in, with the plugin
  // that sent it, if one did.
  const byPlugin = new Set((await store.sent.byPlugins()).map((row) => `${row.profileId}:${row.messageId}`));
  function withSent(id: string) {
    let rest = "";
    const fill = async (part: string) => {
      const line: StreamLine | null = part.includes('"turn_start"') ? JSON.parse(part) : null;
      const sent = line?.type === "turn_start" && (line.input === undefined || byPlugin.has(`${id}:${line.messageId}`)) && (await store.sent.get(id, line.messageId!));
      if (!sent) return part + "\n";
      const { plugin, ...saved } = sent;
      return JSON.stringify({ ...line, ...saved, ...(plugin ? { from: plugin } : {}) }) + "\n";
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

  async function lines(profile: StoredProfile, sessionId: string, cursor: number) {
    return (await open(profile, sessionId))
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

  // A plugin's session, which must be its own, for this bot, on the bot's provider now.
  async function pluginSession(plugin: string, profile: StoredProfile, session: string) {
    const [row] = await store.sql<{ provider: string; plugin: string }[]>`select provider, plugin from plugin_sessions where id = ${session} and profile_id = ${profile.id}`;
    if (row?.plugin !== plugin) fail(404, "session not found");
    if (row.provider !== profile.provider) fail(409, "This session started on the bot's earlier provider. Make a new one.");
  }

  // A message to a bot's own chat, or to a plugin's session for it. Resolves once libfx has stored the prompt; the reply
  // arrives on the stream. libfx takes at most 8 images, 3.75 MiB each and 6 MiB together. A plugin's message names it.
  async function deliver(id: string, { text, messageId, files = [] }: Message, { session, from }: { session?: string; from?: string } = {}) {
    let profile = await get(id);
    if (!Array.isArray(files) || files.length > 8) fail(400, "files must be a list of at most 8");
    if (typeof text !== "string" || (!text.trim() && !files.length)) fail(400, "text is required");
    if (typeof messageId !== "string" || !/^[\w.-]{1,128}$/.test(messageId)) fail(400, "messageId must be 1 to 128 letters, digits, '.', '_', or '-'");
    if (!(await modelFor(profile))) fail(400, "No model. Pick a default model for this bot's provider in Settings, or give the bot one.");
    if (session) await pluginSession(from!, profile, session);
    // Saved before the prompt, so a restart still finds the session and every upload knows its chat. A concurrent
    // first send keeps the id already saved.
    else if (!profile.sessionId) profile = (await store.profiles.claimSession(id, await (await providers.agentFor(profile.provider, "")).newSessionId())) ?? fail(404, "profile not found");
    const sessionId = session ?? profile.sessionId!;
    const by = from ? { from } : {};
    // Plugins may change the message, or handle it themselves, and then no turn runs.
    if (packages.hooked("message")) {
      const event = { bot: id, session: sessionId, text, files, ...by };
      if ((await packages.run("message", event))?.handled) return { messageId, sessionId, handled: true as const };
      ({ text, files } = event);
      if (typeof text !== "string" || !Array.isArray(files)) fail(400, "A plugin left this message without text or files.");
    }
    // A skill named as $name, or /name at the start, goes with the message, so the bot has it without asking.
    const skilled = skills.invoked(id, text);
    const input = files.length || skilled.length ? await attach(profile, sessionId, text, messageId, files, skilled, from) : text;
    if (from && input === text) await store.sent.save(id, messageId, { input: text, files: [], plugin: from });
    if (from) byPlugin.add(`${id}:${messageId}`);
    try {
      // A messageId the session already accepted runs nothing new and resolves to the same ids.
      const turn = (await open(profile, sessionId)).prompt(input, { messageId });
      const accepted = await turn.accepted;
      const names = files.length ? `\n[files: ${files.map((f) => f.name).join(", ")}]` : "";
      await history.record(id, accepted.sessionId, messageId, "user", text + names);
      packages.observe("turn.start", { bot: id, session: accepted.sessionId, messageId, text, ...by });
      finish(id, accepted.sessionId, turn, { text, ...by });
      return accepted;
    } catch (error) {
      // libfx throws a TypeError or RangeError for a prompt it refuses, such as an image whose bytes are not its type.
      throw error instanceof TypeError || error instanceof RangeError ? Object.assign(error, { status: 400 }) : error;
    }
  }

  // Until the owner turns on unvetted plugins, only the ones in fxbot's lists can be looked at and added. Ones already
  // installed keep working and updating.
  const vetted = async () => !(await store.settings.get()).unvetted;
  async function allowed(ref: PluginRef) {
    if (!(await vetted())) return;
    const listed = isRepo(ref)
      ? registry.ourPackage(String(ref.repo))
      : isSkill(ref)
        ? registry.ourSkill(ref.skill)
        : "registry" in ref && ref.from === "fxbot" && (await registry.lookup(String(ref.registry), "fxbot"));
    if (!listed) fail(400, "fxbot doesn't vet this plugin. To add it, turn on unvetted plugins in Settings.");
  }

  // A turn left open by a process that died waits for the session's next prompt unless resumed.
  for (const profile of await store.profiles.list()) {
    if (!profile.sessionId || !providers.has(profile.provider)) continue;
    const session = await open(profile, profile.sessionId).catch(() => null);
    if (session) finish(profile.id, profile.sessionId, session.resume());
  }

  return {
    profiles: {
      // A bot's memories: newest first, or matches for `query`, and the owner's own additions and changes.
      memories: {
        list: async (id: string, query?: { query?: string; limit?: number }) => (await get(id), memories.list(id, query)),
        add: async (id: string, text: unknown) => (await get(id), memories.add(id, text)),
        update: async (id: string, memoryId: string, text: unknown) => (await get(id), memories.update(id, memoryId, text)),
        remove: async (id: string, memoryId: string) => (await get(id), memories.remove(id, memoryId)),
      },
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
      get: async (): Promise<Settings> => ({ ...(await store.settings.get()), ...(await embeddings.settings()) }),
      // Any of the fields. A new remote source embeds a test string first, and keeps the old one if that fails.
      async update(input: Partial<Settings>) {
        if (input.defaultProvider !== undefined) {
          if (typeof input.defaultProvider !== "string") fail(400, "defaultProvider must be a string");
          await store.settings.save({ defaultProvider: await provider(input.defaultProvider.trim()) });
        }
        // Showing unvetted plugins fills the mirror of GitHub's registry for search.
        if (input.unvetted !== undefined) {
          if (typeof input.unvetted !== "boolean") fail(400, "unvetted must be true or false");
          await store.settings.save({ unvetted: input.unvetted });
          if (input.unvetted) void registry.sync();
        }
        const now = await embeddings.settings();
        const next: EmbeddingSettings = { ...now };
        if (input.embedder !== undefined) next.embedder = ["local", "remote", "off"].includes(input.embedder) ? input.embedder : fail(400, "embedder must be local, remote, or off");
        if (input.messageVectors !== undefined)
          next.messageVectors = Number.isInteger(input.messageVectors) && input.messageVectors >= 0 && input.messageVectors <= 100_000 ? input.messageVectors : fail(400, "messageVectors must be a whole number from 0 to 100,000");
        if (input.embeddingModel !== undefined) {
          if (typeof input.embeddingModel !== "string" || input.embeddingModel.trim().length > 200) fail(400, "embeddingModel must be at most 200 characters");
          next.embeddingModel = input.embeddingModel.trim();
        }
        if (input.embeddingProvider !== undefined) {
          if (typeof input.embeddingProvider !== "string") fail(400, "embeddingProvider must be a string");
          next.embeddingProvider = input.embeddingProvider.trim();
          if (next.embeddingProvider && !(embeddingKinds as readonly string[]).includes((await providers.get(next.embeddingProvider)).kind)) fail(400, "That provider serves no embeddings.");
        }
        if (next.embedder === "remote" && (!next.embeddingProvider || !next.embeddingModel)) fail(400, "Pick a provider and an embedding model for remote vectors.");
        const changed = (Object.keys(next) as (keyof EmbeddingSettings)[]).some((field) => next[field] !== now[field]);
        if (changed) {
          const source = (["embedder", "embeddingProvider", "embeddingModel"] as const).some((field) => next[field] !== now[field]);
          if (source && next.embedder === "remote")
            await embeddings.test(next).catch((error: Error) => fail(400, `The embedding model didn't answer: ${error.message}`));
          await embeddings.save(next);
        }
        return this.get();
      },
      // How far memory search's vectors have got. The server adds what the machine runs.
      embedding: embeddings.status,
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

    // Resolves once libfx has stored the prompt; the reply arrives on the stream.
    send: (id: string, message: Message) => deliver(id, message),

    // Every line of the bot's chat from `cursor` on as NDJSON, staying open for new ones. Cancel it to stop.
    // A bot with no session yet, or whose provider is gone, has nothing to replay, so its stream ends at once.
    async stream(id: string, cursor = 0): Promise<ReadableStream<Uint8Array>> {
      const profile = await get(id);
      if (!Number.isInteger(cursor) || cursor < 0) fail(400, "cursor must be a whole number");
      if (!profile.sessionId || !providers.has(profile.provider)) return new ReadableStream({ start: (controller) => controller.close() });
      return (await lines(profile, profile.sessionId, cursor)).pipeThrough(new TextEncoderStream());
    },

    // The cursor of the newest line in the bot's chat, 0 for none. A stream opened after asking replays up to it, then
    // follows, so a page can show the replay at once.
    async streamEnd(id: string) {
      const profile = await get(id);
      return profile.sessionId && providers.has(profile.provider) ? sessions.end(profile.sessionId) : 0;
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

    // Plugins: MCP servers, skills, and packages, one list. Adding one takes the `hash` its preview showed, and fails if
    // it changed since. Secrets are write-only; a listed plugin says only whether it holds them.
    plugins: {
      // With what the registry says about each server now: its details, and a mark when it has a newer version, or is
      // deprecated or gone. Skills and packages carry their marks from the hourly check of their repositories.
      list: async (): Promise<Plugin[]> => [...(await registry.decorate(await mcp.list())), ...skills.list(), ...packages.list()],
      // fxbot's list and GitHub's registry, and with `everything`, the official one's own search too. Skills: fxbot's
      // skills list, then skills.sh's.
      // Until unvetted plugins show, only fxbot's lists, and no registry is asked.
      async search(q: unknown, options: { kind?: unknown; everything?: boolean }) {
        const only = await vetted();
        if (options.kind === "skill") return registry.searchSkills(q, only);
        if (options.kind === "package") return registry.searchPackages(q);
        return registry.search(q, { ...options, vetted: only });
      },
      preview: async (ref: PluginRef) => (await allowed(ref), isRepo(ref) ? packages.preview(ref) : isSkill(ref) ? skills.preview(ref) : mcp.preview(ref)),
      add: async (ref: PluginRef, hash: string) => (await allowed(ref), isRepo(ref) ? packages.add(ref, hash) : isSkill(ref) ? skills.add(ref, hash) : mcp.add(ref, hash)),
      update: (id: string, hash: unknown) => (packages.has(id) ? packages.update(id, hash) : skills.has(id) ? skills.update(id, hash) : mcp.update(id, hash)),
      change: (id: string, input: { enabled?: boolean; bots?: "all" | "each"; allowed?: string[] }) =>
        packages.has(id) ? packages.change(id, input) : skills.has(id) ? skills.change(id, input) : mcp.change(id, input),
      remove: (id: string) => (packages.has(id) ? packages.remove(id) : skills.has(id) ? skills.remove(id) : mcp.remove(id)),
      setSecrets: (id: string, input: PluginSecrets) => mcp.setSecrets(id, input),
      // A bot's switch, read when the plugin is chosen bot by bot.
      async forBot(profileId: string, pluginId: string, enabled: boolean) {
        await get(profileId);
        return packages.has(pluginId) ? packages.forBot(profileId, pluginId, enabled) : skills.has(pluginId) ? skills.forBot(profileId, pluginId, enabled) : mcp.forBot(profileId, pluginId, enabled);
      },
      // A plugin's recent log lines and errors.
      log: (id: string) => packages.log(id),
      // A plugin's settings. Secrets are write-only.
      configure: (id: string, settings: Record<string, unknown>) => packages.configure(id, settings),
      // One of an installed skill's files, to read on its page.
      readSkill: (id: string, file: unknown) => skills.read(id, file),
      // Checks the skills' and plugins' repositories now, as the hourly check does, and marks what changed there.
      check: async () => (await skills.check(), await packages.check()),
      // What the page loads for packages, and their own routes, under `/api/plugins/<name>/`.
      pages: () => packages.pages(),
      file: (name: string, path: string) => packages.file(name, path),
      handle: (name: string, request: Request, path: string) => packages.handle(name, request, path),
      socket: (name: string, path: string) => packages.socket(name, path),
    },

    // OAuth sign-in to an MCP server: start with the page's origin, then poll. The browser comes back to that origin's
    // `/api/oauth/callback`, or the person pastes the address of the page a loopback redirect could not load.
    oauth: mcp.oauth,

    // The running version, and the newest stable release when it is newer.
    release: releases.get,

    // Waits for the turns this process started and the saves of their replies, then lets Postgres go.
    async close() {
      await packages.close();
      embeddings.close();
      releases.close();
      registry.close();
      skills.close();
      await mcp.close();
      await providers.close();
      await Promise.all(saving);
      await sessions.close();
      await store.close();
    },
  };
}

export type Fxbot = Awaited<ReturnType<typeof createFxbot>>;
