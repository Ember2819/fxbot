import type { FxAgentTool, FxResumeTurn, FxSessionPromptInput, FxTurn } from "libfx";
import { createArchives } from "./archive.ts";
import { createEmbeddings, type EmbeddingSettings } from "./embeddings.ts";
import { createHistory, summarize, switchAsk } from "./history.ts";
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
import { colors, maxPinned, shapes, type BotSkill, type Plugin, type PluginRef, type RepoRef, type PluginSecrets, type Fields, type Kind, type LibraryQuery, type Message, type NewProvider, type Profile, type ProfileUpdate, type ProviderUpdate, type Settings, type StreamLine, embeddingKinds, type SkillRef, type Upload } from "./types.ts";

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
  const sessions = await openSessions(store.sql, { databaseUrl, dataDir, backupsDir, backedUp: store.backedUp, turnsAtOnce: (await store.settings.get()).turnsAtOnce }).catch(async (error) => {
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
  // The owner's time zone, kept here so plugins read it without a query. Empty is the machine's.
  let { timeZone } = await store.settings.get();
  const packages = await createPlugins({
    store,
    databaseUrl,
    secretKey: key,
    dataDir,
    archives,
    dirs: options.pluginDirs ?? [],
    taken: () => mcp.prefixes(),
    listedOwner: registry.listedOwner,
    onChange: () => void retool(),
    host: {
      bots: { list: async () => (await store.profiles.list()).map(withBusy), get: async (id) => withBusy(await get(id)) },
      library: {
        read: (bot, id) => library.readFor(bot, id),
        save: ({ bot, session, name, type, bytes }) => library.save({ profileId: bot, sessionId: session, origin: "generated", name, type, bytes }),
        list: async (bot, session) => (await library.list({ profileId: bot, sessionId: session, limit: 100 })).items,
      },
      skills: { files: (bot, name) => skills.files(bot, name) },
      // A bot's memories, kept as its own: an unknown bot is 404.
      memories: {
        get: async (bot, id) => (await get(bot), memories.get(bot, id)),
        save: async (bot, memory) => (await get(bot), memories.save(bot, memory)),
        remove: async (bot, id) => (await get(bot), memories.remove(bot, id)),
      },
      machine: options.machine ?? null,
      timeZone: () => timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      chats: {
        async newSession(plugin, bot) {
          started();
          const profile = await get(bot);
          if (!profile.provider) fail(400, "This bot has no provider.");
          const id = await (await providers.agentFor(profile.provider, "")).newSessionId();
          await store.sql`insert into plugin_sessions (id, profile_id, provider, plugin) values (${id}, ${bot}, ${profile.provider}, ${plugin})`;
          return id;
        },
        send: async (plugin, bot, { text, shown, label, steer, files, session, messageId = crypto.randomUUID() }) =>
          (started(), deliver(bot, { text, files, messageId }, { session, from: plugin, shown, label, steer })),
        async stream(plugin, bot, session, cursor = 0) {
          started();
          const profile = await get(bot);
          await pluginSession(plugin, profile, session);
          if (!Number.isInteger(cursor) || cursor < 0) fail(400, "cursor must be a whole number");
          return (await lines(profile, session, cursor)).pipeThrough(new TextEncoderStream());
        },
        async cancel(plugin, bot, session) {
          started();
          const profile = await get(bot);
          if (session) await pluginSession(plugin, profile, session);
          else {
            const running = profile.sessionId ? working.get(profile.sessionId)?.[0] : undefined;
            const messageId = running?.messageId ?? resumed.get(profile.sessionId!)?.messageId;
            if (!messageId) return;
            // A turn resumed after a restart knows only that a plugin started it.
            if ((running?.sent.from ?? (byPlugin.has(`${bot}:${messageId}`) ? plugin : "")) !== plugin) fail(409, "That turn isn't this plugin's.");
          }
          await (await open(profile, session ?? profile.sessionId!)).cancel();
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
  // What each tool call answered, kept for history until the stream says it ended: the stream has only a preview.
  const answers = new Map<string, unknown>();
  const keepAnswer = (tool: FxAgentTool): FxAgentTool => {
    if (tool.providerExecuted) return tool;
    const { execute } = tool;
    return { ...tool, execute: async (input, context) => {
      const answer = await execute(input, context);
      answers.set(context.executionId, answer);
      return answer;
    } };
  };
  const toolsNow = async () =>
    [history.tool, ...memories.tools, ...library.tools, ...(skills.any() ? [skills.tool] : []), ...(await mcp.tools()), ...packages.tools()].map(packages.wrap).map(keepAnswer);
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
  async function open(profile: StoredProfile, sessionId: string, messageId?: string) {
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
    return agent.session(sessionId, { model: model || undefined, instructions, context: { bot: profile.id, messageId } });
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
  async function attach(profile: StoredProfile, sessionId: string, text: string, messageId: string, files: Upload[], skilled: ReturnType<typeof skills.invoked>, from?: string, shown?: string): Promise<FxSessionPromptInput> {
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
    await store.sent.save(profile.id, messageId, { input: shown ?? text, files: sent, plugin: from });
    return blocks;
  }

  // Each turn's reply is saved after the turn ends, and close waits for the saves.
  const saving = new Set<Promise<void>>();
  type Sent = { text: string; from?: string; steer?: boolean };
  function finish(id: string, sessionId: string, turn: FxTurn | FxResumeTurn, sent: Sent = { text: "" }, reader?: "own" | "next") {
    // After turn.end, so a plugin hears a turn end before the one behind it starts.
    const done = saveReply(id, sessionId, turn, sent, reader)
      .catch((error) => console.error("Could not save a reply:", error))
      .then(() => {
        const next = reader && working.get(sessionId)?.[0];
        if (next) begun(id, sessionId, next);
      });
    saving.add(done);
    void done.finally(() => saving.delete(done));
  }

  // The turns of each bot's own chat, by session, the running one first: whose each is, and whether a message may join
  // it. A plugin's turn takes messages only when it asked to: routines' told turn, with its tools off, mustn't.
  type Working = { messageId: string; sent: Sent; steerable: boolean; started?: boolean };
  const working = new Map<string, Working[]>();
  const workingOn = (id: string, messageId: string, sent: Sent): Working => ({ messageId, sent, steerable: sent.from ? Boolean(sent.steer) : !byPlugin.has(`${id}:${messageId}`) });
  function drop(sessionId: string, messageId: string | null) {
    const rest = (working.get(sessionId) ?? []).filter((t) => t.messageId !== messageId);
    void (rest.length ? working.set(sessionId, rest) : working.delete(sessionId));
  }
  const begun = (id: string, sessionId: string, turn: Working) => void (turn.started || packages.observe("turn.start", { bot: id, session: sessionId, messageId: turn.messageId, ...heard(turn.sent) }), (turn.started = true));
  // Messages sent to join a turn and not in one yet, by id. One that came too late, or was left when a turn stopped, runs
  // as the next turn, which only a "next" reader reads: whichever finds it first, once.
  const steers = new Map<string, Sent & { session: string }>();
  // The turns picked up at start, which name themselves before their first event does.
  const resumed = new Map<string, FxResumeTurn>();
  async function readNext(id: string, sessionId: string) {
    const profile = await store.profiles.get(id);
    if (profile) finish(id, sessionId, (await open(profile, sessionId)).resume(), undefined, "next");
  }
  const heard = ({ text, from }: Sent) => ({ text, ...(from ? { from } : {}) });
  async function saveReply(id: string, sessionId: string, turn: FxTurn | FxResumeTurn, sent: Sent, reader?: "own" | "next") {
    let reply = "";
    let failed: string | undefined;
    let cancelled = false;
    let mine = reader !== "next";
    // The turn's thinking and tool calls go into history as they end, so they read in the order they happened.
    let thinking = "";
    let thoughts = 0;
    const calls = new Map<string, { name: string; input: unknown }>();
    const remember = (key: string, role: "thinking" | "tool", text: string) =>
      history.record(id, sessionId, `${turn.messageId}:${key}`, role, text).catch((error) => console.error("Could not save a step:", error));
    const thought = async () => {
      if (thinking.trim()) await remember(`thinking:${++thoughts}`, "thinking", thinking);
      thinking = "";
    };
    // A search that saved its own results would find them the next time.
    const called = async (callId: string, call: { name: string; input: unknown }, result: string) => {
      answers.delete(callId);
      if (call.name !== "chat_history") await remember(callId, "tool", `${call.name} ${JSON.stringify(call.input ?? {})}\n${result}`);
    };
    // A "next" reader keeps a turn only if it's a steer's: any other has a reader of its own. A turn that fails at once
    // shows no events, so this comes again after them.
    const claim = () => {
      const steer = turn.messageId ? steers.get(turn.messageId) : undefined;
      if (!steer) return false;
      steers.delete(turn.messageId!);
      sent = steer;
      count(id, 1);
      working.set(sessionId, [workingOn(id, turn.messageId!, sent), ...(working.get(sessionId) ?? [])]);
      begun(id, sessionId, working.get(sessionId)![0]);
      return (mine = true);
    };
    if (mine) count(id, 1);
    try {
      for await (const event of turn) {
        if (event.type === "user_message" && event.id) steers.delete(event.id);
        if (!mine && turn.messageId && !claim()) return;
        // A turn resumed at start wasn't sent from here.
        if (reader && turn.messageId && !working.get(sessionId)?.some((t) => t.messageId === turn.messageId)) working.set(sessionId, [{ ...workingOn(id, turn.messageId, sent), started: true }, ...(working.get(sessionId) ?? [])]);
        if (event.type === "reasoning_delta") thinking += event.delta;
        else await thought();
        if (event.type === "text_delta") reply += event.delta;
        if (event.type === "tool_start") calls.set(event.id, { name: event.name, input: event.input ?? event.inputPreview });
        if (event.type === "tool_end") {
          const answer = answers.has(event.id) ? answers.get(event.id) : event.content;
          await called(event.id, calls.get(event.id) ?? { name: event.name, input: undefined }, typeof answer === "string" ? answer : (JSON.stringify(answer, (key, value) => (key === "data" ? "[data]" : value)) ?? ""));
          calls.delete(event.id);
        }
      }
      if (!mine && !claim()) return;
      // A turn libfx ends as failed, or as refused, which is how a provider's HTTP error ends one, with the error as its text.
      const end = await turn.result;
      cancelled = end.stopReason === "cancelled";
      if (end.stopReason === "error" || end.stopReason === "refused") failed = ("error" in end && end.error?.message) || reply.trim() || `The turn ended as ${end.stopReason}.`;
    } catch (error) {
      if (mine && turn.messageId) packages.observe("turn.end", { bot: id, session: sessionId, messageId: turn.messageId, ...heard(sent), reply, error: (error as Error).message });
      return;
    } finally {
      if (mine) {
        await thought();
        for (const [callId, call] of calls) await called(callId, call, "[stopped]");
        count(id, -1);
        if (resumed.get(sessionId) === turn) resumed.delete(sessionId);
        drop(sessionId, turn.messageId);
        if ([...steers.values()].some((steer) => steer.session === sessionId)) void readNext(id, sessionId).catch((error) => console.error("Could not read a steered turn:", error));
      }
    }
    if (turn.messageId) packages.observe("turn.end", { bot: id, session: sessionId, messageId: turn.messageId, ...heard(sent), reply, ...(failed ? { error: failed } : {}), ...(cancelled ? { cancelled } : {}) });
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
      const line: StreamLine | null = part.includes('"turn_start"') || part.includes('"user_message"') ? JSON.parse(part) : null;
      // A message that joined a turn has a line of its own, named by `id`.
      if (line?.type === "user_message") {
        const joined = line.id ? await store.sent.get(id, line.id) : null;
        return joined ? JSON.stringify({ ...line, text: joined.input, files: joined.files, ...(joined.plugin ? { from: joined.plugin } : {}) }) + "\n" : part + "\n";
      }
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

  // One start-over of a bot's own chat at a time. A send to that chat, and a provider switch, wait for the one running;
  // a start-over a message asked for holds it until that message is in the new chat, so one sent meanwhile lands after.
  const moving = new Map<string, Promise<void>>();
  async function hold(id: string) {
    while (moving.has(id)) await moving.get(id);
    let release!: () => void;
    moving.set(id, new Promise<void>((done) => (release = done)));
    return () => (moving.delete(id), release());
  }

  // Starts the bot's own chat over: a new session, whose handoff is a summary of the chat so far that answers `ask`.
  // The provider that ran the chat summarizes its session from its checkpoint, or else `provider` summarizes the stored
  // messages, after the earlier handoff. A turn still running in the old session is cancelled first, and each open
  // stream of the chat ends with a moved line. A provider switch is one: it moves the bot to `provider`.
  async function startOver(profile: StoredProfile, options: { ask: string; heading: (from: string, to: string) => string; provider?: string; model?: string }) {
    const { ask, heading, provider = profile.provider, model = profile.model } = options;
    const [from, to] = [await providers.get(profile.provider).catch(() => null), await providers.get(provider)];
    const previous = profile.handoff ? [profile.handoff] : [];
    if (from) await (await open(profile, profile.sessionId!)).cancel().catch(() => {});
    let summary: string;
    // When the model itself failed, asking the same provider and model again from the transcript only doubles the wait.
    let failed: { model: string; error: Error } | undefined;
    try {
      if (!from) throw new Error("the old provider is gone");
      const oldModel = await modelFor(profile);
      const checkpoint = await (await providers.agentFor(from.id, oldModel)).session(profile.sessionId!).checkpoint();
      summary = await summarize(await providers.options(from), oldModel, instructionsFor(profile), ask, checkpoint).catch((error: Error) => {
        failed = { model: oldModel, error };
        throw error;
      });
    } catch {
      const newModel = model || to.model || fail(400, `Pick a model for ${to.name} first: the old provider could not summarize the chat.`);
      if (failed && from?.id === to.id && failed.model === newModel) fail(502, `The chat could not be summarized: ${failed.error.message}`);
      const known = (await providers.models(to.id).catch(() => [])).find((m) => m.id === newModel);
      const transcript = await history.transcript(profile.id, profile.sessionId!, ((to.contextWindow ?? known?.contextWindow ?? 32_000) * 4) / 2);
      summary = await summarize(await providers.options(to), newModel, [profile.instructions].filter(Boolean), ask, undefined, [...previous, transcript].join("\n\n"))
        .catch((error: Error) => fail(502, `The chat could not be summarized: ${error.message}`));
    }
    const handoff = `${heading(from?.name ?? "a removed provider", to.name)}:\n\n${summary}`;
    const sessionId = await (await providers.agentFor(to.id, "")).newSessionId();
    const saved = (await store.profiles.update(profile.id, { provider, model, sessionId, handoff }))!;
    for (const stream of following.get(profile.id) ?? []) stream.move(sessionId);
    return saved;
  }

  async function switchProvider(profile: StoredProfile, next: string, model: string) {
    const done = await hold(profile.id);
    try {
      return await startOver((await store.profiles.get(profile.id)) ?? profile, {
        provider: next,
        model,
        ask: switchAsk,
        heading: (from, to) => `Earlier conversation, summarized when this bot moved from ${from} to ${to}`,
      });
    } finally {
      done();
    }
  }

  // The open streams of each bot's own chat. A start-over writes a moved line to each, naming the new session, and
  // ends it.
  const following = new Map<string, Set<{ move: (sessionId: string) => void }>>();
  function follow(id: string, source: ReadableStream<Uint8Array>) {
    const reader = source.getReader();
    const streams = following.get(id) ?? following.set(id, new Set()).get(id)!;
    let closed = false;
    const entry = { move: (_: string) => {} };
    const leave = () => (streams.delete(entry), streams.size || following.delete(id));
    return new ReadableStream<Uint8Array>({
      start(controller) {
        entry.move = (sessionId) => {
          leave();
          if (closed) return;
          closed = true;
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "moved", sessionId }) + "\n"));
          controller.close();
          void reader.cancel().catch(() => {});
        };
        streams.add(entry);
      },
      async pull(controller) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (closed) return;
        if (!done) return controller.enqueue(value!);
        closed = true;
        leave();
        controller.close();
      },
      cancel() {
        closed = true;
        leave();
        return reader.cancel();
      },
    });
  }

  // A plugin's session, which must be its own, for this bot, on the bot's provider now.
  async function pluginSession(plugin: string, profile: StoredProfile, session: string) {
    const [row] = await store.sql<{ provider: string; plugin: string }[]>`select provider, plugin from plugin_sessions where id = ${session} and profile_id = ${profile.id}`;
    if (row?.plugin !== plugin) fail(404, "session not found");
    if (row.provider !== profile.provider) fail(409, "This session started on the bot's earlier provider. Make a new one.");
  }

  // A message to a bot's own chat, or to a plugin's session for it. Resolves once libfx has stored the prompt; the reply
  // arrives on the stream. libfx takes at most 8 images, 3.75 MiB each and 6 MiB together. A plugin's message names it,
  // and can show other words and another name in the chat than the model gets.
  async function deliver(id: string, { text, messageId, files = [] }: Message, { session, from, shown, label, steer }: { session?: string; from?: string; shown?: string; label?: string; steer?: boolean } = {}) {
    // A message to the bot's own chat waits for a start-over of it.
    if (!session) while (moving.has(id)) await moving.get(id);
    let profile = await get(id);
    if (!Array.isArray(files) || files.length > 8) fail(400, "files must be a list of at most 8");
    if (typeof text !== "string" || (!text.trim() && !files.length)) fail(400, "text is required");
    if (typeof messageId !== "string" || !/^[\w.-]{1,128}$/.test(messageId)) fail(400, "messageId must be 1 to 128 letters, digits, '.', '_', or '-'");
    if (!(await modelFor(profile))) fail(400, "No model. Pick a default model for this bot's provider in Settings, or give the bot one.");
    if (session) await pluginSession(from!, profile, session);
    // Saved before the prompt, so a restart still finds the session and every upload knows its chat. A concurrent
    // first send keeps the id already saved.
    else if (!profile.sessionId) profile = (await store.profiles.claimSession(id, await (await providers.agentFor(profile.provider, "")).newSessionId())) ?? fail(404, "profile not found");
    let sessionId = session ?? profile.sessionId!;
    const by = from ? { from } : {};
    let done: (() => void) | undefined;
    // Plugins may change the message, or handle it themselves, and then no turn runs.
    if (packages.hooked("message")) {
      const event = { bot: id, session: sessionId, text, files, ...by };
      const answer = await packages.run("message", event);
      if (answer?.handled) return { messageId, sessionId, handled: true as const };
      ({ text, files } = event);
      if (typeof text !== "string" || !Array.isArray(files)) fail(400, "A plugin left this message without text or files.");
      // Or start the bot's own chat over first: only a chat with messages, and only once for a message, so a retry of
      // one that went through runs nothing new.
      if (answer?.startOver && !session) {
        done = await hold(id);
        try {
          profile = await get(id);
          const [{ any, seen }] = await store.sql<{ any: boolean; seen: boolean }[]>`select
            exists (select 1 from messages where profile_id = ${id} and session_id = ${profile.sessionId}) as any,
            exists (select 1 from messages where profile_id = ${id} and message_id = ${messageId} and role = 'user') as seen`;
          if (any && !seen) profile = await startOver(profile, { ask: answer.startOver.ask, heading: () => "Earlier conversation, summarized when the chat started over" });
          sessionId = profile.sessionId!;
        } catch (error) {
          done();
          throw error;
        }
      }
    }
    try {
      return await prompt();
    } finally {
      done?.();
    }
  async function prompt() {
    // A plugin that took everything out of the message leaves nothing to send.
    if (!text.trim() && !files.length) return { messageId, sessionId, handled: true as const };
    // A skill named as $name, or /name at the start, goes with the message, so the bot has it without asking.
    const skilled = skills.invoked(id, text);
    const input = files.length || skilled.length ? await attach(profile, sessionId, text, messageId, files, skilled, label ?? from, shown) : text;
    if (from && input === text) await store.sent.save(id, messageId, { input: shown ?? text, files: [], plugin: label ?? from });
    if (from) byPlugin.add(`${id}:${messageId}`);
    const names = files.length ? `\n[files: ${files.map((f) => f.name).join(", ")}]` : "";
    const sent: Sent = { text, ...by, steer };
    try {
      // A message to a chat with a turn running joins it, when the turn takes messages and this one may: the owner's
      // always, and a plugin's that asks, unless it has an image, since an image ends the running turn. libfx runs it as
      // the next turn if the running one ended meanwhile, so it's read either way. Nothing is read when it joined.
      const running = session || (from && (!steer || files.some((f) => f.type.startsWith("image/")))) ? undefined : working.get(sessionId)?.[0];
      if (running?.steerable && running.messageId !== messageId) {
        const chat = await open(profile, sessionId, messageId);
        steers.set(messageId, { ...sent, session: sessionId });
        // Only text joins a turn, so a skill goes as text. libfx would end the turn for it, as for an image.
        const joining = Array.isArray(input) ? input.map((block) => (block.type === "resource" ? { type: "text" as const, text: block.resource.text } : block)) : input;
        // A reader on each side of it. One reads from the stream's end, and a steer that came too late can start its turn
        // at once, which the one after it would miss. The one before it ends first if the chat has gone quiet.
        const before = chat.resume();
        await before.accepted;
        finish(id, sessionId, before, sent, "next");
        await chat.steer(joining, { messageId }).catch((error) => {
          steers.delete(messageId);
          throw error;
        });
        finish(id, sessionId, chat.resume(), sent, "next");
        await history.record(id, sessionId, messageId, "user", text + names);
        return { messageId, sessionId, joined: running.messageId };
      }
      const own = session ? undefined : workingOn(id, messageId, sent);
      if (own && !working.get(sessionId)?.some((t) => t.messageId === messageId)) working.set(sessionId, [...(working.get(sessionId) ?? []), own]);
      // A messageId the session already accepted runs nothing new and resolves to the same ids.
      const turn = (await open(profile, sessionId, messageId)).prompt(input, { messageId });
      const accepted = await turn.accepted;
      await history.record(id, accepted.sessionId, messageId, "user", text + names);
      // A turn behind another starts when that one ends.
      const first = own ? working.get(sessionId)?.[0] : workingOn(id, messageId, sent);
      if (first?.messageId === messageId) begun(id, accepted.sessionId, first);
      finish(id, accepted.sessionId, turn, sent, own && "own");
      return accepted;
    } catch (error) {
      if (!session) drop(sessionId, messageId);
      // libfx throws a TypeError or RangeError for a prompt it refuses, such as an image whose bytes are not its type.
      throw error instanceof TypeError || error instanceof RangeError ? Object.assign(error, { status: 400 }) : error;
    }
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
    if (!session) continue;
    const turn = session.resume();
    resumed.set(profile.sessionId, turn);
    finish(profile.id, profile.sessionId, turn, undefined, "own");
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
      // Stops the turn running in the bot's own chat, whoever started it. A message that hadn't joined it runs next.
      async stop(id: string) {
        const profile = await get(id);
        if (profile.sessionId) await (await open(profile, profile.sessionId)).cancel();
      },
      // The bot's skills, for the $ and / picker in its chat.
      // Its skills, then its plugins' commands, for the $ and / list.
      skills: async (id: string): Promise<BotSkill[]> => (await get(id), [...skills.listFor(id), ...packages.commands(id).map((c) => ({ ...c, command: true as const }))]),
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
        // The bot a launch at / opens: 400 for an id that isn't one, 404 for no such bot.
        if (input.defaultProfile !== undefined) {
          if (typeof input.defaultProfile !== "string") fail(400, "defaultProfile must be a string");
          if (input.defaultProfile) await get(input.defaultProfile);
          await store.settings.save({ defaultProfile: input.defaultProfile });
        }
        // The owner's time zone, which plugins read. An empty one is the machine's.
        if (input.timeZone !== undefined) {
          if (typeof input.timeZone !== "string") fail(400, "timeZone must be a string");
          const zone = input.timeZone.trim();
          try {
            if (zone) new Intl.DateTimeFormat("en", { timeZone: zone });
          } catch {
            fail(400, "That isn't a time zone.");
          }
          await store.settings.save({ timeZone: zone });
          timeZone = zone;
        }
        // How many turns run at once. The queue reads it when fxbot starts.
        if (input.turnsAtOnce !== undefined) {
          if (!Number.isInteger(input.turnsAtOnce) || input.turnsAtOnce < 4 || input.turnsAtOnce > 100) fail(400, "Turns at once must be a whole number from 4 to 100.");
          await store.settings.save({ turnsAtOnce: input.turnsAtOnce });
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
    // A bot with no session yet, or whose provider is gone, has nothing to replay, so its stream ends at once. When the
    // chat starts over, the stream ends with a moved line naming the new session. `session` is the one `cursor` is
    // in, and a chat that moved from it since answers that line alone.
    async stream(id: string, cursor = 0, session?: string): Promise<ReadableStream<Uint8Array>> {
      const profile = await get(id);
      if (!Number.isInteger(cursor) || cursor < 0) fail(400, "cursor must be a whole number");
      if (session && profile.sessionId && session !== profile.sessionId)
        return new ReadableStream({ start: (c) => (c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "moved", sessionId: profile.sessionId }) + "\n")), c.close()) });
      if (!profile.sessionId || !providers.has(profile.provider)) return new ReadableStream({ start: (controller) => controller.close() });
      return follow(id, (await lines(profile, profile.sessionId, cursor)).pipeThrough(new TextEncoderStream()));
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
      // An installed package's page, from the files it runs.
      contents: (id: string) => packages.contents(id),
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

    // Waits for the turns this process started and the saves of their replies, with the plugins, MCP servers, and
    // skills they use still there, then stops those and lets Postgres go.
    async close() {
      await providers.close();
      await Promise.all(saving);
      await packages.close();
      embeddings.close();
      releases.close();
      registry.close();
      skills.close();
      await mcp.close();
      await sessions.close();
      await store.close();
    },
  };
}

export type Fxbot = Awaited<ReturnType<typeof createFxbot>>;
