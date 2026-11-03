import type { Sql } from "postgres";
import type { Profile, Upload } from "./types.ts";

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
  "tool.before": { bot: string; session: string; tool: string; input: unknown };
  /** After it: change `result`. A call that failed has `error` instead. */
  "tool.after": { bot: string; session: string; tool: string; input: unknown; result?: unknown; error?: string };
  /** Once libfx accepts the prompt. Only observes. */
  "turn.start": { bot: string; session: string; messageId: string; text: string; from?: string };
  /** When the turn ends, with its reply, or `error` when it failed. Only observes. */
  "turn.end": { bot: string; session: string; messageId: string; text: string; reply: string; error?: string; from?: string };
  /** The plugin's settings changed. */
  settings: { settings: Record<string, string> };
};
export type HookAnswers = { message: { handled: true }; "tool.before": { block: string } };
export type Hook<E extends keyof HookEvents> = (event: HookEvents[E]) => unknown;

// A tool for bots, named `<plugin>_<name>` when they see it. `bot` and `session` are the chat's that called it.
export type PluginTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Running a call twice is harmless, so a call cut off by a crash runs again. */
  idempotent: boolean;
  execute: (input: any, call: { bot: string; session: string; signal: AbortSignal }) => unknown;
};

// A route under `/api/plugins/<plugin>/`, such as `/rooms/:id`. `params` holds the named parts.
export type PluginRoute = (request: Request, params: Record<string, string>) => Response | Promise<Response>;

export type PluginApi = {
  /** The plugin's name, its id in fxbot. */
  name: string;
  on<E extends keyof HookEvents>(event: E, handler: Hook<E>): void;
  tool(tool: PluginTool): void;
  route(method: string, path: string, handler: PluginRoute): void;
  /** Postgres, in the plugin's own schema, `plugin_<name>`, which its migrations made. */
  sql: Sql;
  /** Its settings, with secrets opened. Kept up to date in place. */
  settings: Record<string, string>;
  bots: { list(): Promise<Profile[]>; get(id: string): Promise<Profile> };
  chats: {
    /** A session of the plugin's own for a bot, on its current provider. */
    newSession(bot: string): Promise<string>;
    /** A message, as the owner's are sent, marked as the plugin's. Without `session`, it goes to the bot's own chat. */
    send(bot: string, message: { text: string; files?: Upload[]; session?: string; messageId?: string }): Promise<{ messageId: string; sessionId: string }>;
    /** A session's lines as NDJSON, from `cursor` on, then each new one. */
    stream(bot: string, session: string, cursor?: number): Promise<ReadableStream<Uint8Array>>;
  };
  /** Writes to the plugin's log, which shows on its row in Plugins. */
  log(...parts: unknown[]): void;
  /** Aborts when the plugin unloads. */
  signal: AbortSignal;
};
