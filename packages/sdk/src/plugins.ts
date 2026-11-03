import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FxAgentHostTool, FxAgentTool } from "libfx";
import type { Hook, HookEvents, PluginApi, PluginTool } from "./plugin-api.ts";
import { newId, type AddonRecord, type Store } from "./store.ts";
import type { PluginAddon, PluginSetting, PluginSource } from "./types.ts";

const fail = (status: 400 | 404, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

// fxbot's own fields in an Agent Plugins manifest live under its namespace, the reverse of its domain.
export const namespace = "sh.fxbot";
const pluginName = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Core tools' prefixes, which a plugin's name would collide with.
const reserved = ["chat", "memory", "library", "skill"];
// A message, instructions, or tool hook gets this long before it counts as failed; setup gets twice as long.
const limit = 5000;

// What fxbot reads from a plugin's plugin.json.
export type Manifest = { name: string; version: string; description: string; server?: string; page?: string; css?: string; migrations?: string; settings: PluginSetting[] };
type PluginRecord = AddonRecord<Manifest> & { kind: "plugin"; source: PluginSource };
type Loaded = { hooks: Map<keyof HookEvents, Hook<keyof HookEvents>[]>; tools: PluginTool[]; cleanup?: () => unknown; controller: AbortController };
type Plugin = { record: PluginRecord; loaded?: Loaded; error?: string; log: string[] };

// A part's path: relative, inside the plugin's folder.
const part = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.startsWith("/") || value.split(/[\\/]/).includes("..")) fail(400, `${field} must be a path inside the plugin`);
  return (value as string).replace(/^\.\//, "");
};

// plugin.json, checked. A manifest that fxbot can't use says why.
export function parseManifest(text: string): Manifest {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "plugin.json isn't JSON.");
  }
  const { name, version = "0.0.0", description = "" } = json;
  if (typeof name !== "string" || !pluginName.test(name) || name.length > 40) fail(400, "plugin.json's name must be up to 40 lowercase letters, digits, and dashes.");
  if (typeof version !== "string" || typeof description !== "string") fail(400, "plugin.json's version and description must be strings.");
  const own = ((json.extensions as Record<string, unknown> | undefined)?.[namespace] ?? {}) as Record<string, unknown>;
  const settings = Array.isArray(own.settings) ? own.settings : [];
  for (const setting of settings)
    if (typeof setting?.name !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(setting.name) || typeof (setting.description ?? "") !== "string")
      fail(400, "Each of plugin.json's settings needs a name and a description.");
  return {
    name: name as string,
    version: version as string,
    description: description as string,
    server: part(own.server, "server"),
    page: part(own.page, "page"),
    css: part(own.css, "css"),
    migrations: part(own.migrations, "migrations"),
    settings: settings.map(({ name, description = "", default: value, isRequired, isSecret }: Record<string, unknown>) => ({
      name: name as string,
      description: description as string,
      ...(typeof value === "string" ? { default: value } : {}),
      ...(isRequired === true ? { isRequired: true } : {}),
      ...(isSecret === true ? { isSecret: true } : {}),
    })),
  };
}

// A promise that fails after `ms`, for a hook or a setup that takes too long.
function within<T>(run: () => T | Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took over ${ms / 1000} seconds`)), ms)));
  return Promise.race([Promise.resolve().then(run), late]).finally(() => clearTimeout(timer));
}

export type PluginHost = {
  bots: PluginApi["bots"];
};

// Plugins: code that changes fxbot itself, run in its process. Each is an add-on of kind "plugin". In a checkout,
// FXBOT_PLUGIN_DIRS names folders that load at start. Hooks run in the order the plugins were added, and each sees
// what the one before it changed. A plugin's hooks and tools apply to its bots: all, or each one chosen.
export async function createPlugins({ store, dirs, taken, onChange, host }: { store: Store; dirs: string[]; taken: () => string[]; onChange: () => void; host: PluginHost }) {
  const plugins = new Map<string, Plugin>();
  for (const record of await store.addons.list()) if (record.kind === "plugin") plugins.set(record.id, { record: record as PluginRecord, log: [] });
  const on = new Map<string, Set<string>>();
  for (const { profileId, addonId } of await store.addons.on()) if (plugins.has(addonId)) on.set(addonId, (on.get(addonId) ?? new Set()).add(profileId));
  const get = (id: string) => plugins.get(id) ?? fail(404, "add-on not found");
  const folders = new Set(dirs.map((dir) => resolve(dir)));
  const folderOf = (record: PluginRecord) => ("local" in record.source ? record.source.local : "");

  function write(plugin: Plugin, line: string) {
    plugin.log.push(`${new Date().toISOString()} ${line}`);
    if (plugin.log.length > 100) plugin.log.shift();
    console.log(`[plugin ${plugin.record.name}] ${line}`);
  }
  const report = (plugin: Plugin, what: string, error: unknown) => write(plugin, `${what} failed: ${said(error)}`);

  // A plugin's hooks and tools reach a bot when it runs, is on, and is for that bot.
  const applies = (plugin: Plugin, bot: string) => Boolean(plugin.loaded && plugin.record.enabled && (plugin.record.bots === "all" || on.get(plugin.record.id)?.has(bot)));
  const hooked = (event: keyof HookEvents) => [...plugins.values()].some((p) => p.loaded?.hooks.get(event)?.length);

  // A folder of FXBOT_PLUGIN_DIRS is added on first sight, and its manifest read again at every start.
  for (const folder of folders) {
    try {
      const manifest = parseManifest(await readFile(resolve(folder, "plugin.json"), "utf8"));
      const same = [...plugins.values()].find((p) => p.record.name === manifest.name);
      if (same && folderOf(same.record) !== folder) throw new Error(`a plugin named ${manifest.name} is added already`);
      if (same) {
        same.record = { ...same.record, config: manifest };
        await store.addons.update(same.record.id, { config: manifest });
        continue;
      }
      const record: PluginRecord = { id: newId(), kind: "plugin", name: manifest.name, source: { local: folder }, config: manifest, approvedHash: "", enabled: true, bots: "all", allowed: null, status: null };
      await store.addons.create(record);
      plugins.set(record.id, { record, log: [] });
    } catch (error) {
      console.error(`fxbot could not add the plugin in ${folder}: ${said(error)}`);
    }
  }

  // Imports the plugin's server code and runs its setup. One that throws, or takes over 10 seconds, stays added but off,
  // with its error on its row.
  async function load(plugin: Plugin) {
    const { record } = plugin;
    const loaded: Loaded = { hooks: new Map(), tools: [], controller: new AbortController() };
    const api: PluginApi = {
      name: record.name,
      on(event, handler) {
        if (typeof handler !== "function") throw new Error(`${event}'s handler must be a function`);
        loaded.hooks.set(event, [...(loaded.hooks.get(event) ?? []), handler as Hook<keyof HookEvents>]);
      },
      tool(tool) {
        const name = `${record.name}_${tool?.name}`;
        if (typeof tool?.name !== "string" || !/^[a-z0-9_]+$/.test(tool.name) || name.length > 64) throw new Error(`A tool's name must be lowercase letters, digits, and _, and ${record.name}_<name> at most 64 characters.`);
        if (typeof tool.execute !== "function" || typeof tool.description !== "string" || typeof tool.idempotent !== "boolean" || typeof tool.inputSchema !== "object")
          throw new Error(`${name} needs a description, an inputSchema, idempotent, and execute.`);
        if (loaded.tools.some((t) => t.name === tool.name)) throw new Error(`${name} is added already.`);
        loaded.tools.push(tool);
        if (plugin.loaded === loaded) onChange();
      },
      route() {
        throw new Error("Routes come in a later milestone.");
      },
      sql: undefined as never,
      settings: {},
      bots: host.bots,
      chats: undefined as never,
      log: (...parts) => write(plugin, parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")),
      signal: loaded.controller.signal,
    };
    try {
      if (!("local" in record.source)) throw new Error("Plugins from GitHub come in a later milestone.");
      if (!folders.has(folderOf(record))) throw new Error("Its folder isn't in FXBOT_PLUGIN_DIRS any more.");
      if ([...reserved, ...taken()].includes(record.name)) throw new Error(`Its name, ${record.name}, is a prefix another add-on's tools use.`);
      const { server } = record.config;
      if (server) {
        // A new URL each load, so an update or a reload reads the files again.
        const module = await import(`${pathToFileURL(resolve(folderOf(record), server)).href}?at=${Date.now()}`);
        if (typeof module.default !== "function") throw new Error(`${server} has no default export to call.`);
        const cleanup = await within(() => module.default(api), 2 * limit, "Its setup");
        if (typeof cleanup === "function") loaded.cleanup = cleanup;
      }
      plugin.loaded = loaded;
      plugin.error = undefined;
      write(plugin, `loaded ${record.config.version}`);
    } catch (error) {
      loaded.controller.abort();
      plugin.loaded = undefined;
      plugin.error = said(error);
      report(plugin, "Loading", error);
    }
  }

  async function unload(plugin: Plugin) {
    const loaded = plugin.loaded;
    if (!loaded) return;
    plugin.loaded = undefined;
    loaded.controller.abort();
    await within(() => loaded.cleanup?.(), limit, "Its cleanup").catch((error) => report(plugin, "Cleanup", error));
  }

  // A hook's handlers, plugin by plugin, for the event's bot. A message hook may handle the message, and a tool.before
  // hook may block the call; either ends the run with its answer. A handler that throws or runs late is logged and
  // skipped, except before a tool call, where it blocks, so a broken guard never lets a call through.
  async function run<E extends keyof HookEvents>(event: E, payload: HookEvents[E] & { bot: string }): Promise<{ handled?: true; block?: string } | undefined> {
    for (const plugin of plugins.values()) {
      if (!applies(plugin, payload.bot)) continue;
      for (const handler of plugin.loaded!.hooks.get(event) ?? []) {
        try {
          const answer = (await within(() => handler(payload), limit, `A ${event} hook`)) as { handled?: unknown; block?: unknown } | undefined;
          if (event === "message" && answer?.handled === true) return { handled: true };
          if (event === "tool.before" && typeof answer?.block === "string") return { block: answer.block };
        } catch (error) {
          report(plugin, `A ${event} hook`, error);
          if (event === "tool.before") return { block: `${plugin.record.name} stopped this call: ${said(error)}` };
        }
      }
    }
    return undefined;
  }

  // turn.start and turn.end only observe, so they never hold up a turn.
  function observe<E extends "turn.start" | "turn.end">(event: E, payload: HookEvents[E]) {
    for (const plugin of plugins.values())
      if (applies(plugin, payload.bot))
        for (const handler of plugin.loaded!.hooks.get(event) ?? []) void within(() => handler(payload), 60_000, `A ${event} hook`).catch((error) => report(plugin, `A ${event} hook`, error));
  }

  // Every tool, core and add-on alike, passes through the tool hooks. With none, it runs as it is.
  function wrap(tool: FxAgentTool): FxAgentTool {
    if (tool.providerExecuted) return tool;
    const { execute } = tool;
    return {
      ...tool,
      async execute(input, context) {
        if (!hooked("tool.before") && !hooked("tool.after")) return execute(input, context);
        const bot = (context.context as { bot?: string } | undefined)?.bot ?? "";
        const call = { bot, session: context.sessionId, tool: tool.name, input };
        const answer = await run("tool.before", call);
        if (answer?.block) throw new Error(answer.block);
        const after: HookEvents["tool.after"] & { bot: string } = { ...call };
        try {
          after.result = await execute(call.input, context);
        } catch (error) {
          after.error = said(error);
          await run("tool.after", after);
          throw error;
        }
        await run("tool.after", after);
        return after.result;
      },
    };
  }

  // A plugin's tools, as bots see them: `<plugin>_<name>`, refusing a bot the plugin isn't on for.
  function toolsOf(plugin: Plugin): FxAgentHostTool[] {
    return (plugin.loaded?.tools ?? []).map((tool) => ({
      name: `${plugin.record.name}_${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema as FxAgentHostTool["inputSchema"],
      idempotent: tool.idempotent,
      async execute(input, context) {
        const bot = (context.context as { bot?: string } | undefined)?.bot;
        if (!bot || !applies(plugin, bot)) throw new Error(`${plugin.record.name} is off for this bot.`);
        return tool.execute(input, { bot, session: context.sessionId, signal: context.signal });
      },
    }));
  }

  function view(plugin: Plugin): PluginAddon {
    const { record, loaded } = plugin;
    return {
      id: record.id,
      kind: "plugin",
      name: record.name,
      enabled: record.enabled,
      bots: record.bots,
      on: [...(on.get(record.id) ?? [])],
      status: "",
      source: record.source,
      version: record.config.version,
      description: record.config.description,
      settings: record.config.settings.map((setting) => ({ ...setting, set: false })),
      parts: {
        tools: (loaded?.tools ?? []).map((t) => `${record.name}_${t.name}`),
        hooks: [...(loaded?.hooks.keys() ?? [])],
        routes: [],
        page: Boolean(record.config.page),
      },
      ...(plugin.error ? { error: plugin.error } : {}),
    };
  }

  async function save(plugin: Plugin, fields: Partial<Pick<PluginRecord, "enabled" | "bots">>) {
    plugin.record = { ...plugin.record, ...fields };
    await store.addons.update(plugin.record.id, fields);
  }

  return {
    has: (id: string) => plugins.has(id),
    names: () => [...plugins.values()].map((p) => p.record.name),
    // Loads every plugin that's on, in the order they were added.
    async start() {
      for (const plugin of plugins.values()) if (plugin.record.enabled) await load(plugin);
    },
    hooked,
    run,
    observe,
    wrap,
    tools: () => [...plugins.values()].flatMap(toolsOf),
    list: () => [...plugins.values()].map(view),
    log: (id: string) => get(id).log,
    async change(id: string, input: { enabled?: unknown; bots?: unknown }) {
      const plugin = get(id);
      if (input.enabled !== undefined && typeof input.enabled !== "boolean") fail(400, "enabled must be true or false");
      if (input.bots !== undefined && input.bots !== "all" && input.bots !== "each") fail(400, 'bots must be "all" or "each"');
      const enabled = input.enabled as boolean | undefined;
      await save(plugin, { ...(enabled === undefined ? {} : { enabled }), ...(input.bots ? { bots: input.bots as "all" | "each" } : {}) });
      if (enabled === false) await unload(plugin);
      if (enabled === true && !plugin.loaded) await load(plugin);
      onChange();
      return view(plugin);
    },
    async forBot(profileId: string, addonId: string, enabled: unknown) {
      const plugin = get(addonId);
      if (typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      await store.addons.forBot(profileId, addonId, enabled as boolean);
      const bots = on.get(addonId) ?? new Set<string>();
      if (enabled) bots.add(profileId);
      else bots.delete(profileId);
      on.set(addonId, bots);
      return view(plugin);
    },
    async remove(id: string) {
      const plugin = get(id);
      await unload(plugin);
      plugins.delete(id);
      on.delete(id);
      await store.addons.remove(id);
      onChange();
    },
    async close() {
      for (const plugin of plugins.values()) await unload(plugin);
    },
  };
}

export type Plugins = Awaited<ReturnType<typeof createPlugins>>;
