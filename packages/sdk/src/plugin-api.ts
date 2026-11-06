import type { Sql } from "postgres";
import type { LibraryItem, Memory, Profile, Upload } from "./types.ts";

// What a plugin's server code gets. A plugin's `server` module exports one function, which fxbot calls with this API
// when the plugin loads, and which may return a cleanup for when it unloads. Plugin authors import these types from
// `@fxbot/sdk`; the import is types only, so Node erases it.

// A hook's event. A handler changes the event's fields in place, and the next handler sees the change.
export type HookEvents = {
  /** Before a message runs: change `text` and `files`, or answer `{ handled: true }` and no turn runs. */
  message: { bot: string; session: string; text: string; files: Upload[]; from?: string };
  /** Each time a chat opens: add, change, or remove entries. */
  instructions: { bot: string; session: string; instructions: string[] };
  /** Before every tool call: change `input`, or answer `{ block: reason }`, which the model gets as a failed call. */
  "tool.before": { bot: string; session: string; messageId: string; tool: string; input: unknown };
  /** After it: change `result`. A call that failed has `error` instead. */
  "tool.after": { bot: string; session: string; messageId: string; tool: string; input: unknown; result?: unknown; error?: string };
  /** Once libfx accepts the prompt, or in a bot's own chat, when a turn it waited behind ends. Only observes. */
  "turn.start": { bot: string; session: string; messageId: string; text: string; from?: string };
  /** When the turn ends, with its reply, or `error` when it failed, or `cancelled` when it was stopped. Only observes. */
  "turn.end": { bot: string; session: string; messageId: string; text: string; reply: string; error?: string; cancelled?: boolean; from?: string };
  /** The plugin's settings changed. */
  settings: { settings: Record<string, string> };
  /** A plugin that needs this one was added, updated, or removed: the ones that need it now. */
  dependents: { dependents: Dependent[] };
};
// A message hook handles the message, or starts the bot's own chat over from a summary that answers `ask`, and then the
// message goes to the new chat.
export type HookAnswers = { message: { handled: true } | { startOver: { ask: string } }; "tool.before": { block: string } };
export type Hook<E extends keyof HookEvents> = (event: HookEvents[E]) => unknown;

// A tool for bots, named `<plugin>_<name>` when they see it. `bot` and `session` are the chat's that called it, and
// `messageId` the message whose turn it's in.
export type PluginTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Running a call twice is harmless, so a call cut off by a crash runs again. */
  idempotent: boolean;
  execute: (input: any, call: { bot: string; session: string; messageId: string; signal: AbortSignal }) => unknown;
};

// A plugin that needs this one, with what it asked of it: its block under `needs` in its plugin.json. `api` is what it
// provides, or null while it isn't running.
export type Dependent = { name: string; version: string; needs: Record<string, unknown>; api: Record<string, unknown> | null };

// A route under `/api/plugins/<plugin>/`, such as `/rooms/:id`. `params` holds the named parts.
export type PluginRoute = (request: Request, params: Record<string, string>) => Response | Promise<Response>;

// A WebSocket the page opened to one of the plugin's sockets. Binary messages come as a Buffer, text as a string.
export type PluginSocket = {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onmessage: ((data: Buffer | string) => void) | null;
  onclose: (() => void) | null;
  /** Bytes queued to send and not yet sent, for flow control. */
  readonly bufferedAmount: number;
};
// A socket under `/api/plugins/<plugin>/`, such as `/desktop/:bot`, with the request that opened it.
export type PluginSocketHandler = (socket: PluginSocket, request: Request, params: Record<string, string>) => unknown;

/** How a job the machine does as root went: asked and not taken yet, working, done, or failed and why. */
export type MachineJob = { state: "asked" | "working" | "done" | "failed"; error?: string };
/** The machine's fxbot command, in an install made by setup.sh. Its only job for plugins is `computer`, which sets up
 * the computer plugin's engine. */
export type PluginMachine = {
  ask(job: "computer"): void;
  /** How the job went, or null when it was never asked for. */
  status(job: "computer"): MachineJob | null;
};

export type PluginApi = {
  /** The plugin's name, its id in fxbot. */
  name: string;
  on<E extends keyof HookEvents>(event: E, handler: Hook<E>): void;
  tool(tool: PluginTool): void;
  route(method: string, path: string, handler: PluginRoute): void;
  /** A WebSocket at `/api/plugins/<plugin><path>`, for a two-way stream a route can't carry. */
  socket(path: string, handler: PluginSocketHandler): void;
  /** Postgres, in the plugin's own schema, `plugin_<name>`, which its migrations made. */
  sql: Sql;
  /** Its settings, with secrets opened. Kept up to date in place. */
  settings: Record<string, string>;
  bots: {
    list(): Promise<Profile[]>;
    get(id: string): Promise<Profile>;
    /** Whether this plugin is on for the bot. Since 0.6.0. */
    on(id: string): boolean;
  };
  chats: {
    /** A session of the plugin's own for a bot, on its current provider. */
    newSession(bot: string): Promise<string>;
    /** A message, as the owner's are sent, marked as the plugin's. Without `session`, it goes to the bot's own chat.
     * `shown` is what the chat shows of it, when that isn't `text`, which the model gets, and `label` who it says it's
     * from, in place of the plugin. With `steer`, a message to the own chat joins a turn that's running, and answers
     * that turn's id as `joined`, and its own turn takes messages the same way. One with an image waits instead. Since 0.6.0. */
    send(bot: string, message: { text: string; shown?: string; label?: string; steer?: boolean; files?: Upload[]; session?: string; messageId?: string }): Promise<{ messageId: string; sessionId: string; joined?: string }>;
    /** A session's lines as NDJSON, from `cursor` on, then each new one. */
    stream(bot: string, session: string, cursor?: number): Promise<ReadableStream<Uint8Array>>;
    /** Stops the turn running in one of the plugin's own sessions, if one runs: it ends `cancelled`. With no session,
     * the one running in the bot's own chat, if this plugin started it. Since 0.6.0. */
    cancel(bot: string, session?: string): Promise<void>;
  };
  /** The added plugins that need this one, each with its block for this one, and what it provides. */
  dependents(): Dependent[];
  /** Offers an object to the plugins that need this one: they get it with fx.need, and this one reads theirs in
   * fx.dependents(). Since 0.5.0. */
  provide(api: Record<string, unknown>): void;
  /** What a plugin named under this one's needs provides, or null while it isn't running. Read it at each use: an
   * update or a reload replaces it. Since 0.5.0. */
  need<T = Record<string, unknown>>(name: string): T | null;
  library: {
    /** An item's bytes, if it is tagged for the bot. */
    read(bot: string, id: string): Promise<{ name: string; type: string; bytes: Buffer }>;
    /** Saves to the bot's library, tagged for the chat, through the library's checks: an image, or UTF-8 text. */
    save(item: { bot: string; session: string; name: string; type: string; bytes: Buffer }): Promise<LibraryItem>;
    /** The items saved in one chat of the bot, newest first. Since 0.6.0. */
    list(bot: string, session: string): Promise<LibraryItem[]>;
  };
  skills: {
    /** The files of the skill the bot sees by that name, besides SKILL.md. None when it has no such skill. */
    files(bot: string, name: string): { path: string; text: string }[];
    /** The skills this plugin gives one bot, in place of those it gave before, each a SKILL.md's name, description,
     * and body. They reach the bot's catalog, its skill tool, and its / list while the plugin is on for it, and go when
     * the plugin unloads, so the plugin keeps them and sets them again in its setup. Since 0.5.0. */
    set(bot: string, skills: { name: string; description: string; instructions: string }[]): void;
  };
  /** The bots' memories, kept as the bot's own, as its memory tools keep them. Since 0.5.0. */
  memories: {
    /** One of the bot's memories, or null when it has none by that id. */
    get(bot: string, id: string): Promise<Memory | null>;
    /** Saves a memory as the bot's, as memory_save does: with `replaces`, that memory's text changes. `existed`: the
     * same text was saved already. `merged`: the replaced memory now said what another did, so it went into that one. */
    save(bot: string, memory: { text: string; replaces?: string }): Promise<{ memory: Memory; existed: boolean; merged: boolean }>;
    /** Deletes one. A missing one throws with status 404. */
    remove(bot: string, id: string): Promise<void>;
  };
  /** The owner's time zone, such as Europe/Berlin: Settings › General's, or the machine's. Read it at each use. Since 0.6.0. */
  timeZone(): string;
  /** The machine's fxbot command, for a job only root can do; null in a checkout, which has none. */
  machine: PluginMachine | null;
  /** Writes to the plugin's log, which shows on its row in Plugins. */
  log(...parts: unknown[]): void;
  /** Aborts when the plugin unloads. */
  signal: AbortSignal;
};
