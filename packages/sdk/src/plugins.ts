import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FxAgentHostTool, FxAgentTool } from "libfx";
import postgres, { type Sql } from "postgres";
import type { Hook, HookEvents, PluginApi, PluginRoute, PluginTool } from "./plugin-api.ts";
import type { RepoFiles } from "./archive.ts";
import { createSecrets } from "./secrets.ts";
import { parseSkill, type CarriedSkill, type Row } from "./skills.ts";
import { newId, type AddonRecord, type Store } from "./store.ts";
import type { AddonMark, PluginAddon, PluginPage, PluginPreview, PluginRef, PluginSetting, PluginSource, SkillFile } from "./types.ts";

const fail = (status: 400 | 404 | 409 | 502, message: string): never => {
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
// From GitHub: up to 2 MiB a file, text only, and 20 MB in all.
const maxFile = 2 * 1024 * 1024;
const maxPlugin = 20 * 1000 * 1000;
const hour = 60 * 60 * 1000;
const refOf = /^([A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})(?:\/(.+))?$/;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

// What fxbot reads from a plugin's plugin.json.
export type Manifest = { name: string; version: string; description: string; server?: string; page?: string; css?: string; migrations?: string; settings: PluginSetting[] };
// A plugin from GitHub keeps its files' list, for what an update changes, and the MCP servers it added.
type Config = Manifest & { files?: SkillFile[]; servers?: string[] };
type PluginRecord = AddonRecord<Config> & { kind: "plugin"; source: PluginSource };
type Route = { method: string; path: string; parts: string[]; handler: PluginRoute };
type Loaded = { hooks: Map<keyof HookEvents, Hook<keyof HookEvents>[]>; tools: PluginTool[]; routes: Route[]; sql?: Sql; cleanup?: () => unknown; controller: AbortController };
// `saved` holds the owner's settings, and `settings` those with the defaults, which the plugin reads.
// `skills` are the ones it carries, read when it loads.
type Plugin = { record: PluginRecord; loaded?: Loaded; error?: string; log: string[]; saved: Record<string, string>; settings: Record<string, string>; skills: Row[] };
type Archives = { head(repo: string): Promise<string>; files(repo: string, commit: string, fileLimit?: number): Promise<RepoFiles> };
type Server = { name: string; url?: string; headers: string[]; transport?: "sse" };

// mcp.json's servers, in the shape Claude Code and Agent Plugins write: a remote one has a `url`; one with a `command`
// runs on this machine, which plugins don't do yet.
function serversIn(text?: string): Server[] {
  if (!text) return [];
  try {
    const json = JSON.parse(text);
    return Object.entries((json.mcpServers ?? json.servers ?? {}) as Record<string, Record<string, unknown>>).map(([name, server]) => ({
      name,
      ...(typeof server?.url === "string" ? { url: server.url } : {}),
      headers: server?.headers && typeof server.headers === "object" ? Object.keys(server.headers) : [],
      ...(server?.type === "sse" ? { transport: "sse" as const } : {}),
    }));
  } catch {
    return [];
  }
}

// A plugin's schema: plugin_<name>, with _ for -.
export const schemaOf = (name: string) => `plugin_${name.replace(/-/g, "_")}`;

// A route's path against a request's: the named parts, or null when they don't match.
function match(parts: string[], path: string[]) {
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of parts.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(path[i]);
    else if (part !== path[i]) return null;
  }
  return params;
}

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

// What fxbot's core gives plugins: its bots, and turns marked as the plugin's.
export type PluginHost = {
  bots: PluginApi["bots"];
  chats: {
    newSession(plugin: string, bot: string): Promise<string>;
    send(plugin: string, bot: string, message: Parameters<PluginApi["chats"]["send"]>[1]): Promise<{ messageId: string; sessionId: string }>;
    stream(plugin: string, bot: string, session: string, cursor?: number): Promise<ReadableStream<Uint8Array>>;
  };
  // A plugin's remote MCP server, added as an MCP add-on of its own, and removed with it.
  addServer(server: { url: string; headers: string[]; transport?: "sse"; allowLocal: boolean }): Promise<string>;
  removeServer(id: string): Promise<void>;
};

// Plugins: code that changes fxbot itself, run in its process. Each is an add-on of kind "plugin". In a checkout,
// FXBOT_PLUGIN_DIRS names folders that load at start. Hooks run in the order the plugins were added, and each sees
// what the one before it changed. A plugin's hooks and tools apply to its bots: all, or each one chosen.
export async function createPlugins(options: {
  store: Store;
  databaseUrl: string;
  secretKey: Buffer;
  dataDir: string;
  archives: Archives;
  dirs: string[];
  taken: () => string[];
  onChange: () => void;
  host: PluginHost;
}) {
  const { store, databaseUrl, secretKey, dataDir, archives, dirs, taken, onChange, host } = options;
  // Settings, secret or not, are sealed together, as an MCP server's header values are.
  const secrets = createSecrets(store.sql, secretKey, "addon_secrets");
  const plugins = new Map<string, Plugin>();
  const add = (record: PluginRecord) => plugins.set(record.id, { record, log: [], saved: {}, settings: {}, skills: [] }).get(record.id)!;
  for (const record of await store.addons.list()) if (record.kind === "plugin") add(record as PluginRecord);
  const on = new Map<string, Set<string>>();
  for (const { profileId, addonId } of await store.addons.on()) if (plugins.has(addonId)) on.set(addonId, (on.get(addonId) ?? new Set()).add(profileId));
  const get = (id: string) => plugins.get(id) ?? fail(404, "add-on not found");
  const folders = new Set(dirs.map((dir) => resolve(dir)));
  // A local plugin runs from its folder; one from GitHub from its commit's files, in FXBOT_DATA/plugins/<name>/.
  const folderOf = (record: PluginRecord) => ("local" in record.source ? record.source.local : resolve(dataDir, "plugins", record.name, record.source.commit));
  const marks = new Map<string, AddonMark>();
  // A commit the hourly check found the plugin unchanged at, so it isn't read again.
  const same = new Map<string, string>();

  function write(plugin: Plugin, line: string) {
    plugin.log.push(`${new Date().toISOString()} ${line}`);
    if (plugin.log.length > 100) plugin.log.shift();
    console.log(`[plugin ${plugin.record.name}] ${line}`);
  }
  const report = (plugin: Plugin, what: string, error: unknown) => write(plugin, `${what} failed: ${said(error)}`);

  // A plugin's hooks and tools reach a bot when it runs, is on, and is for that bot.
  const applies = (plugin: Plugin, bot: string) => Boolean(plugin.loaded && plugin.record.enabled && (plugin.record.bots === "all" || on.get(plugin.record.id)?.has(bot)));
  const hooked = (event: keyof HookEvents) => [...plugins.values()].some((p) => p.loaded?.hooks.get(event)?.length);

  // A folder of FXBOT_PLUGIN_DIRS is added on first sight, and its manifest read again at every start. A new one's
  // servers are added when the plugins start.
  const fresh: { plugin: Plugin; servers: Server[] }[] = [];
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
      fresh.push({ plugin: add(record), servers: serversIn(await readFile(resolve(folder, "mcp.json"), "utf8").catch(() => undefined)) });
    } catch (error) {
      console.error(`fxbot could not add the plugin in ${folder}: ${said(error)}`);
    }
  }

  // Each remote server its mcp.json names, added as an MCP add-on. One that can't be added is logged.
  async function addServers(plugin: Plugin, servers: Server[], allowLocal: boolean) {
    const ids: string[] = [];
    for (const { name, url, headers, transport } of servers) {
      if (!url) continue;
      try {
        ids.push(await host.addServer({ url, headers, ...(transport ? { transport } : {}), allowLocal }));
        write(plugin, `added its MCP server ${name}`);
      } catch (error) {
        report(plugin, `Adding its MCP server ${name}`, error);
      }
    }
    if (!ids.length) return;
    plugin.record = { ...plugin.record, config: { ...plugin.record.config, servers: ids } };
    await store.addons.update(plugin.record.id, { config: plugin.record.config });
  }

  // The skills in its skills/ folder, as the skills.sh layout has them: skills/<name>/SKILL.md, with its other files.
  async function skillsIn(plugin: Plugin, folder: string): Promise<Row[]> {
    const root = join(folder, "skills");
    const files: string[] = [];
    for (const entry of await readdir(root, { recursive: true }).catch(() => [] as string[]))
      if ((await stat(join(root, String(entry)))).isFile()) files.push(String(entry).replaceAll("\\", "/"));
    const rows: Row[] = [];
    for (const file of files.filter((f) => /^[^/]+\/SKILL\.md$/.test(f))) {
      const dir = file.split("/")[0];
      const parsed = parseSkill(await readFile(join(root, file), "utf8"));
      if ("error" in parsed) {
        write(plugin, `Its skill ${dir} can't be read: ${parsed.error}`);
        continue;
      }
      const resources = [];
      for (const other of files.filter((f) => f.startsWith(`${dir}/`) && f !== file))
        resources.push({ uri: `skill://${parsed.name}/${other.slice(dir.length + 1)}`, text: await readFile(join(root, other), "utf8") });
      rows.push({ addonId: plugin.record.id, name: parsed.name, description: parsed.description, instructions: parsed.body, resources, manual: parsed.manual });
    }
    return rows;
  }

  // A plugin's page at its repository's current commit, or at `commit`, and the files Add would write.
  async function look(ref: PluginRef, commit?: string) {
    const text = typeof ref?.plugin === "string" ? ref.plugin.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "") : "";
    const [, repo, path = ""] = refOf.exec(text) ?? fail(400, "plugin must be <owner>/<repo>, or <owner>/<repo>/<folder>");
    if (path.split("/").some((part) => !part || part === "." || part === "..")) fail(400, "The plugin's folder must be a path inside the repository.");
    const at = commit ?? (await archives.head(repo).catch((error: Error) => fail(502, error.message)));
    const all = await archives.files(repo, at, maxFile).catch((error: Error) => fail(502, error.message));
    const inside = (p: string) => !path || p.startsWith(`${path}/`);
    const relative = (p: string) => (path ? p.slice(path.length + 1) : p);
    const files = [...all.text].filter(([p]) => inside(p)).map(([p, t]) => [relative(p), t] as [string, string]).sort(([a], [b]) => (a < b ? -1 : 1));
    const page: PluginPreview = {
      hash: "",
      name: "",
      version: "",
      description: "",
      source: { repo, path, commit: at, from: ref.from === "fxbot" ? "fxbot" : "github" },
      files: files.map(([p, t]) => ({ path: p, size: Buffer.byteLength(t), hash: sha(t).slice(0, 12) })),
      skipped: [...all.skipped].filter(([p]) => inside(p)).map(([p, why]) => ({ path: relative(p), why })),
      code: [],
      texts: {},
      settings: [],
      migrations: [],
      skills: [],
      servers: [],
    };
    const byPath = new Map(files);
    const where = `${repo}${path ? `/${path}` : ""}`;
    if (!byPath.has("plugin.json")) return { page: { ...page, error: `${where} has no plugin.json at ${at.slice(0, 7)}.` }, files };
    page.texts["plugin.json"] = byPath.get("plugin.json")!;
    let manifest: Manifest;
    try {
      manifest = parseManifest(byPath.get("plugin.json")!);
    } catch (error) {
      return { page: { ...page, error: said(error) }, files };
    }
    Object.assign(page, { name: manifest.name, version: manifest.version, description: manifest.description, settings: manifest.settings });
    page.code = [manifest.server, manifest.page].filter((p): p is string => Boolean(p));
    const missing = [...page.code, manifest.css].filter((p) => p && !byPath.has(p));
    if (missing.length) return { page: { ...page, error: `plugin.json names ${missing.join(" and ")}, which ${where} doesn't have.` }, files };
    page.migrations = manifest.migrations ? files.map(([p]) => p).filter((p) => p.startsWith(`${manifest.migrations}/`) && p.endsWith(".sql")) : [];
    for (const p of [...page.code, ...(manifest.css ? [manifest.css] : []), ...page.migrations]) page.texts[p] = byPath.get(p)!;
    page.skills = files.flatMap(([p, t]) => (/^skills\/[^/]+\/SKILL\.md$/.test(p) ? [((parsed) => ("error" in parsed ? `${p.split("/")[1]} (${parsed.error})` : parsed.name))(parseSkill(t))] : []));
    page.servers = serversIn(byPath.get("mcp.json")).map(({ name, url }) => ({ name, ...(url ? { url } : {}), used: Boolean(url) }));
    if (page.files.reduce((n, f) => n + f.size, 0) > maxPlugin) return { page: { ...page, error: `It is over ${maxPlugin / 1000 / 1000} MB.` }, files };
    page.hash = sha(JSON.stringify(files));
    // An installed plugin's page says what an update changes.
    const installed = [...plugins.values()].find(({ record: r }) => "repo" in r.source && r.source.repo === repo && r.source.path === path);
    if (installed?.record.config.files) {
      const before = new Map(installed.record.config.files.map((f) => [f.path, f.hash]));
      const after = new Map(page.files.map((f) => [f.path, f.hash]));
      page.changed = [
        ...page.files.filter((f) => before.has(f.path) && before.get(f.path) !== f.hash).map((f) => ({ path: f.path, change: "changed" as const })),
        ...page.files.filter((f) => !before.has(f.path)).map((f) => ({ path: f.path, change: "added" as const })),
        ...[...before.keys()].filter((p) => !after.has(p)).map((p) => ({ path: p, change: "removed" as const })),
      ];
    }
    return { page, files, manifest };
  }

  async function writeFiles(folder: string, files: [string, string][]) {
    await rm(folder, { recursive: true, force: true });
    for (const [path, text] of files) {
      await mkdir(dirname(join(folder, path)), { recursive: true });
      await writeFile(join(folder, path), text);
    }
  }

  // Every hour: each plugin's repository HEAD. When it moved, the plugin is read again there, and marked only when its
  // files changed, or it is gone.
  async function check() {
    for (const plugin of plugins.values()) {
      const { source, approvedHash, id } = plugin.record;
      if (!("repo" in source)) continue;
      const head = await archives.head(source.repo).catch(() => null);
      if (!head || head === source.commit || same.get(id) === head) continue;
      const looked = await look({ plugin: `${source.repo}${source.path ? `/${source.path}` : ""}`, from: source.from }, head).catch(() => null);
      if (!looked) continue;
      if (looked.page.error?.includes("has no plugin.json")) marks.set(id, { kind: "removed" });
      else if (looked.page.hash && looked.page.hash !== approvedHash) marks.set(id, { kind: "update", version: head.slice(0, 7) });
      else (marks.delete(id), same.set(id, head));
    }
  }
  const timer = setInterval(() => void check().catch(() => {}), hour);
  timer.unref();
  const first = setTimeout(() => void check().catch(() => {}), 60_000);
  first.unref();

  // The defaults, then what the owner set, kept in the same object, which the plugin holds.
  function settle(plugin: Plugin) {
    for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
    for (const { name, default: value } of plugin.record.config.settings) if (value !== undefined) plugin.settings[name] = value;
    Object.assign(plugin.settings, plugin.saved);
  }

  // Its schema, then each of its migrations it hasn't run, in name order, each in a transaction. The names run are kept
  // in the schema's _migrations.
  async function migrate(plugin: Plugin, sql: Sql, folder: string) {
    await store.sql.unsafe(`create schema if not exists "${schemaOf(plugin.record.name)}"`);
    const dir = plugin.record.config.migrations;
    if (!dir) return;
    await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((row) => row.name));
    const files = (await readdir(join(folder, dir))).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((name) => !done.has(name))) {
      const text = await readFile(join(folder, dir, name), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into _migrations (name) values (${name})`;
      }).catch((error: Error) => fail(400, `Migration ${name} failed: ${error.message}`));
      write(plugin, `ran migration ${name}`);
    }
  }

  // Imports the plugin's server code and runs its setup. One that throws, or takes over 10 seconds, stays added but off,
  // with its error on its row.
  async function load(plugin: Plugin) {
    const { record } = plugin;
    const loaded: Loaded = { hooks: new Map(), tools: [], routes: [], controller: new AbortController() };
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
      route(method, path, handler) {
        if (typeof method !== "string" || typeof path !== "string" || !path.startsWith("/") || typeof handler !== "function")
          throw new Error("A route needs a method, a path that starts with /, and a handler.");
        loaded.routes.push({ method: method.toUpperCase(), path, parts: path.split("/").filter(Boolean), handler });
      },
      sql: undefined as never,
      settings: plugin.settings,
      bots: host.bots,
      chats: {
        newSession: (bot) => host.chats.newSession(record.name, bot),
        send: (bot, message) => host.chats.send(record.name, bot, message),
        stream: (bot, session, cursor) => host.chats.stream(record.name, bot, session, cursor),
      },
      log: (...parts) => write(plugin, parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")),
      signal: loaded.controller.signal,
    };
    try {
      if ("local" in record.source && !folders.has(folderOf(record))) throw new Error("Its folder isn't in FXBOT_PLUGIN_DIRS any more.");
      if ([...reserved, ...taken()].includes(record.name)) throw new Error(`Its name, ${record.name}, is a prefix another add-on's tools use.`);
      // Its own Postgres: two connections at most, in its schema.
      loaded.sql = api.sql = postgres(databaseUrl, { max: 2, onnotice: () => {}, connection: { search_path: schemaOf(record.name) } });
      await migrate(plugin, loaded.sql, folderOf(record));
      settle(plugin);
      plugin.skills = await skillsIn(plugin, folderOf(record));
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
      await loaded.sql?.end({ timeout: 5 });
      plugin.loaded = undefined;
      plugin.error = said(error);
      report(plugin, "Loading", error);
    }
  }

  async function unload(plugin: Plugin) {
    const loaded = plugin.loaded;
    if (!loaded) return;
    plugin.loaded = undefined;
    plugin.skills = [];
    loaded.controller.abort();
    await within(() => loaded.cleanup?.(), limit, "Its cleanup").catch((error) => report(plugin, "Cleanup", error));
    await loaded.sql?.end({ timeout: 5 });
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
      files: record.config.files ?? [],
      servers: record.config.servers ?? [],
      settings: record.config.settings.map((setting) => ({
        ...setting,
        set: setting.name in plugin.saved,
        ...(setting.isSecret || !(setting.name in plugin.saved) ? {} : { value: plugin.saved[setting.name] }),
      })),
      parts: {
        tools: (loaded?.tools ?? []).map((t) => `${record.name}_${t.name}`),
        hooks: [...(loaded?.hooks.keys() ?? [])],
        routes: (loaded?.routes ?? []).map((r) => `${r.method} ${r.path}`),
        page: Boolean(record.config.page),
      },
      ...(plugin.error ? { error: plugin.error } : {}),
      ...(marks.has(record.id) ? { mark: marks.get(record.id) } : {}),
    };
  }

  async function save(plugin: Plugin, fields: Partial<Pick<PluginRecord, "enabled" | "bots">>) {
    plugin.record = { ...plugin.record, ...fields };
    await store.addons.update(plugin.record.id, fields);
  }

  return {
    has: (id: string) => plugins.has(id),
    names: () => [...plugins.values()].map((p) => p.record.name),
    // Loads every plugin that's on, in the order they were added. A local plugin being written may point at servers on
    // this machine.
    async start() {
      for (const { plugin, servers } of fresh) await addServers(plugin, servers, true);
      for (const plugin of plugins.values()) {
        plugin.saved = (await secrets.get<{ values: Record<string, string> }>(plugin.record.id).catch(() => undefined))?.values ?? {};
        if (plugin.record.enabled) await load(plugin);
      }
    },
    // The running plugins' page code and CSS, by URL. A pinned plugin's URL names its commit, so it can be kept for
    // good; a local one's names when its file last changed.
    async pages(): Promise<PluginPage[]> {
      const pages: PluginPage[] = [];
      for (const { record, loaded } of plugins.values()) {
        const { page, css, version } = record.config;
        if (!loaded || !record.enabled || (!page && !css)) continue;
        const stamp = async (file: string) =>
          "commit" in record.source ? record.source.commit.slice(0, 12) : String(Math.floor((await stat(resolve(folderOf(record), file))).mtimeMs));
        const url = async (file?: string) => (file ? { [file === page ? "page" : "css"]: `/api/plugins/${record.name}/files/${file}?v=${await stamp(file)}` } : {});
        pages.push({ name: record.name, version, ...(await url(page)), ...(await url(css)) });
      }
      return pages;
    },
    // A running plugin's page code or CSS, and nothing else of its files.
    async file(name: string, path: string) {
      const plugin = [...plugins.values()].find((p) => p.record.name === name && p.loaded && p.record.enabled) ?? fail(404, `No plugin named ${name} is running.`);
      const { page, css } = plugin.record.config;
      if (path !== page && path !== css) fail(404, "not found");
      return { type: path === page ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", data: await readFile(resolve(folderOf(plugin.record), path)), pinned: "commit" in plugin.record.source };
    },
    // A request to `/api/plugins/<name>/<path>`, answered by the plugin's route for it.
    async handle(name: string, request: Request, path: string): Promise<Response> {
      const plugin = [...plugins.values()].find((p) => p.record.name === name && p.loaded && p.record.enabled) ?? fail(404, `No plugin named ${name} is running.`);
      const segments = path.split("/").filter(Boolean);
      for (const route of plugin.loaded!.routes) {
        if (route.method !== request.method && !(route.method === "GET" && request.method === "HEAD")) continue;
        const params = match(route.parts, segments);
        if (!params) continue;
        try {
          const response = await route.handler(request, params);
          if (!(response instanceof Response)) throw new Error("The route answered without a Response.");
          return response;
        } catch (error) {
          report(plugin, `${request.method} ${route.path}`, error);
          return Response.json({ error: said(error) }, { status: 500 });
        }
      }
      return Response.json({ error: "not found" }, { status: 404 });
    },
    // The owner's settings: a value for each one named, or "" to go back to its default. Secrets go in and never out.
    async configure(id: string, input: Record<string, unknown>) {
      const plugin = get(id);
      if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "settings must map names to values");
      const saved = { ...plugin.saved };
      for (const [name, value] of Object.entries(input)) {
        if (!plugin.record.config.settings.some((s) => s.name === name)) fail(400, `${plugin.record.name} has no setting ${name}.`);
        if (typeof value !== "string" || value.length > 8192) fail(400, `${name} must be text, up to 8 KiB.`);
        if (value === "") delete saved[name];
        else saved[name] = value as string;
      }
      await secrets.put(id, { values: saved });
      plugin.saved = saved;
      settle(plugin);
      for (const handler of plugin.loaded?.hooks.get("settings") ?? [])
        await within(() => handler({ settings: plugin.settings }), limit, "A settings hook").catch((error) => report(plugin, "A settings hook", error));
      return view(plugin);
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
    // Its cleanup runs, then its schema, its sessions, its settings, its switches, its servers, and its files go.
    async remove(id: string) {
      const plugin = get(id);
      await unload(plugin);
      plugins.delete(id);
      on.delete(id);
      marks.delete(id);
      await store.sql.unsafe(`drop schema if exists "${schemaOf(plugin.record.name)}" cascade`);
      await store.sql`delete from plugin_sessions where plugin = ${plugin.record.name}`;
      await store.addons.remove(id);
      secrets.forget(id);
      for (const server of plugin.record.config.servers ?? []) await host.removeServer(server).catch(() => {});
      if (!("local" in plugin.record.source)) await rm(resolve(dataDir, "plugins", plugin.record.name), { recursive: true, force: true });
      onChange();
    },

    // The skills running plugins carry, for the bots each is on for.
    carried: (): CarriedSkill[] =>
      [...plugins.values()].flatMap((plugin) => plugin.skills.map((row) => ({ id: `${plugin.record.name}/${row.name}`, row, applies: (bot: string) => applies(plugin, bot) }))),

    preview: async (ref: PluginRef) => (await look(ref)).page,
    // Writes the files the page showed, makes its schema, adds its remote servers, and loads it.
    async add(ref: PluginRef, hash: unknown) {
      const { page, files, manifest } = await look(ref);
      if (page.error || !manifest) return fail(400, page.error ?? "This plugin can't be added.");
      if (page.hash !== hash) fail(409, "The plugin changed since its page was shown. Look at it again.");
      if ([...plugins.values()].some((p) => p.record.name === manifest.name)) fail(409, `A plugin named ${manifest.name} is added already.`);
      if ([...reserved, ...taken()].includes(manifest.name)) fail(400, `Its name, ${manifest.name}, is a prefix another add-on's tools use.`);
      const record: PluginRecord = {
        id: newId(),
        kind: "plugin",
        name: manifest.name,
        source: page.source,
        config: { ...manifest, files: page.files },
        approvedHash: page.hash,
        enabled: true,
        bots: "all",
        allowed: null,
        status: null,
      };
      await writeFiles(folderOf(record), files);
      await store.addons.create(record);
      const plugin = add(record);
      await addServers(plugin, serversIn(new Map(files).get("mcp.json")), false);
      await load(plugin);
      onChange();
      return view(plugin);
    },
    // Moves it to its repository's current commit, the one its page showed. A version that doesn't load leaves the old
    // one running.
    async update(id: string, hash: unknown) {
      const plugin = get(id);
      const before = plugin.record;
      if (!("repo" in before.source)) return fail(400, "A local plugin runs from its folder. Restart fxbot to load it again.");
      const { page, files, manifest } = await look({ plugin: `${before.source.repo}${before.source.path ? `/${before.source.path}` : ""}`, from: before.source.from });
      if (page.error || !manifest) return fail(400, page.error ?? "This version can't be added.");
      if (page.hash !== hash) fail(409, "The plugin changed since its page was shown. Look at it again.");
      if (manifest.name !== before.name) fail(400, `This version is named ${manifest.name}. Remove ${before.name} and add it instead.`);
      const next: PluginRecord = { ...before, source: page.source, config: { ...manifest, files: page.files, servers: before.config.servers }, approvedHash: page.hash };
      if (folderOf(next) !== folderOf(before)) await writeFiles(folderOf(next), files);
      await unload(plugin);
      plugin.record = next;
      await load(plugin);
      if (!plugin.loaded) {
        const error = plugin.error;
        plugin.record = before;
        await load(plugin);
        if (folderOf(next) !== folderOf(before)) await rm(folderOf(next), { recursive: true, force: true });
        return fail(400, `${page.source.commit.slice(0, 7)} didn't load, so ${before.name} stays at ${before.source.commit.slice(0, 7)}: ${error}`);
      }
      await store.addons.update(id, { source: next.source, config: next.config, approvedHash: next.approvedHash });
      if (folderOf(next) !== folderOf(before)) await rm(folderOf(before), { recursive: true, force: true });
      marks.delete(id);
      onChange();
      return view(plugin);
    },
    check,

    async close() {
      clearInterval(timer);
      clearTimeout(first);
      for (const plugin of plugins.values()) await unload(plugin);
    },
  };
}

export type Plugins = Awaited<ReturnType<typeof createPlugins>>;
