import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FxAgentHostTool, FxAgentTool } from "libfx";
import postgres, { type Sql } from "postgres";
import type { Dependent, Hook, HookEvents, PluginApi, PluginRoute, PluginSocket, PluginSocketHandler, PluginTool } from "./plugin-api.ts";
import type { RepoFiles } from "./archive.ts";
import { fitSaid, unfit, type PluginBreak } from "./plugin-fit.ts";
import { createSecrets } from "./secrets.ts";
import { parseSkill, skillProblem, type CarriedSkill, type Row } from "./skills.ts";
import { newId, type PluginRecord, type Store } from "./store.ts";
import type { PluginMark, PackagePlugin, PluginPage, PackagePreview, RepoRef, PluginSetting, PackageSource, SkillFile } from "./types.ts";

const fail = (status: 400 | 404 | 409 | 502, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

// fxbot's own fields in an Agent Plugins manifest live under its namespace, the reverse of its domain.
export const namespace = "sh.fxbot";
const pluginName = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Core tools' prefixes, which a plugin's name would collide with.
const reserved = ["chat", "memory", "library", "skill"];
// Names fxbot uses beside packages: the words under /api/plugins/, and the app's own paths. A plugin's id is 12 hex
// characters, so a name can't look like one.
const fxbotsOwn = ["pages", "preview", "search", "addons", "plugins", "settings", "library", "profiles"];
// A message, instructions, or tool hook gets this long before it counts as failed; setup gets twice as long.
const limit = 5000;
// From GitHub: up to 2 MiB a file, text only, and 20 MB in all.
const maxFile = 2 * 1024 * 1024;
const maxPlugin = 20 * 1000 * 1000;
const hour = 60 * 60 * 1000;
const refOf = /^([A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})(?:\/(.+))?$/;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

// What fxbot reads from a plugin's plugin.json. `needs` maps each plugin it needs to what it asks of that one.
export type Manifest = {
  name: string;
  version: string;
  description: string;
  /** The oldest fxbot it runs on, as x.y.z. */
  minFxbot?: string;
  server?: string;
  page?: string;
  css?: string;
  migrations?: string;
  settings: PluginSetting[];
  needs: Record<string, Record<string, unknown>>;
  /** Commands for the `/` list, which its message hook carries out. */
  commands?: { name: string; description: string }[];
};
// A plugin from GitHub keeps its files' list, for what an update changes, and the MCP servers it added.
type Config = Manifest & { files?: SkillFile[]; servers?: string[] };
type PackageRecord = PluginRecord<Config> & { kind: "package"; source: PackageSource };
type Route = { method: string; path: string; parts: string[]; handler: PluginRoute };
type Socket = { path: string; parts: string[]; handler: PluginSocketHandler };
// `open` holds its sockets that are open now, which close when it unloads.
type Loaded = {
  hooks: Map<keyof HookEvents, Hook<keyof HookEvents>[]>;
  tools: PluginTool[];
  routes: Route[];
  sockets: Socket[];
  open: Set<PluginSocket>;
  sql?: Sql;
  cleanup?: () => unknown;
  controller: AbortController;
  /** What it provides to the plugins that need it. */
  api?: Record<string, unknown>;
};
// `saved` holds the owner's settings, and `settings` those with the defaults, which the plugin reads.
// `skills` are the ones it carries, read when it loads, and `given` those it gives each bot at runtime (fx.skills.set).
type Package = { record: PackageRecord; loaded?: Loaded; error?: string; unsupported?: string; log: string[]; saved: Record<string, string>; settings: Record<string, string>; skills: Row[]; given: Map<string, Row[]> };
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
  if (fxbotsOwn.includes(name as string) || /^[0-9a-f]{12}$/.test(name as string)) fail(400, `plugin.json's name can't be ${name}: fxbot uses that name itself.`);
  if (typeof version !== "string" || typeof description !== "string") fail(400, "plugin.json's version and description must be strings.");
  const own = ((json.extensions as Record<string, unknown> | undefined)?.[namespace] ?? {}) as Record<string, unknown>;
  const { minFxbot } = own;
  if (minFxbot !== undefined && (typeof minFxbot !== "string" || !/^\d+\.\d+\.\d+$/.test(minFxbot))) fail(400, "plugin.json's minFxbot must be a version, such as 0.7.0.");
  const settings = Array.isArray(own.settings) ? own.settings : [];
  for (const setting of settings)
    if (typeof setting?.name !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(setting.name) || typeof (setting.description ?? "") !== "string")
      fail(400, "Each of plugin.json's settings needs a name and a description.");
  const needs = own.needs ?? {};
  const isObject = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isObject(needs) || Object.entries(needs).some(([other, block]) => !pluginName.test(other) || other === name || !isObject(block)))
    fail(400, "plugin.json's needs must map other plugins' names to an object each.");
  if (Buffer.byteLength(JSON.stringify(needs)) > 16 * 1024) fail(400, "plugin.json's needs must be at most 16 KiB.");
  const commands = (own.commands ?? []) as { name: string; description: string }[];
  if (!Array.isArray(commands) || commands.some((c) => typeof c?.name !== "string" || !pluginName.test(c.name) || c.name.length > 40 || typeof c.description !== "string" || c.description.length > 200))
    fail(400, "plugin.json's commands must each have a name of up to 40 lowercase letters, digits, and dashes, and a description of up to 200 characters.");
  return {
    name: name as string,
    version: version as string,
    description: description as string,
    ...(minFxbot ? { minFxbot: minFxbot as string } : {}),
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
    needs: needs as Manifest["needs"],
    ...(commands.length ? { commands: commands.map(({ name, description }) => ({ name, description })) } : {}),
  };
}

// A promise that fails after `ms`, for a hook or a setup that takes too long.
function within<T>(run: () => T | Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took over ${ms / 1000} seconds`)), ms)));
  return Promise.race([Promise.resolve().then(run), late]).finally(() => clearTimeout(timer));
}

type Wait = (call: { input: unknown }) => Promise<{ block: string } | void>;

// What fxbot's core gives plugins: its bots, and turns marked as the plugin's.
export type PluginHost = {
  bots: Omit<PluginApi["bots"], "on">;
  timeZone: PluginApi["timeZone"];
  library: PluginApi["library"];
  skills: Pick<PluginApi["skills"], "files">;
  memories: PluginApi["memories"];
  models: PluginApi["models"];
  machine: PluginApi["machine"];
  chats: {
    newSession(plugin: string, bot: string): Promise<string>;
    send(plugin: string, bot: string, message: Parameters<PluginApi["chats"]["send"]>[1]): Promise<{ messageId: string; sessionId: string; joined?: string }>;
    stream(plugin: string, bot: string, session: string, cursor?: number): Promise<ReadableStream<Uint8Array>>;
    ownerSaid: PluginApi["chats"]["ownerSaid"];
    cancel(plugin: string, bot: string, session?: string): Promise<void>;
  };
  // A package's remote MCP server, added as an MCP plugin of its own, which follows the package's switch and bots, and
  // is removed with it.
  addServer(server: { url: string; headers: string[]; transport?: "sse"; allowLocal: boolean }): Promise<string>;
  changeServer(id: string, input: { enabled?: boolean; bots?: "all" | "each" }): Promise<unknown>;
  serverForBot(profileId: string, id: string, enabled: boolean): Promise<unknown>;
  removeServer(id: string): Promise<void>;
};

// Plugins: code that changes fxbot itself, run in its process. Each is a plugin of kind "package". In a checkout,
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
  // The owner of fxbot's list entry with a plugin's name, for a checkout's folder of it.
  listedOwner: (name: string) => string | undefined;
  /** The running version, and what fxbot's releases broke for plugins. */
  version: string;
  breaks: () => PluginBreak[];
}) {
  const { store, databaseUrl, secretKey, dataDir, archives, dirs, taken, onChange, host, listedOwner, version, breaks } = options;
  // Settings, secret or not, are sealed together, as an MCP server's header values are.
  const secrets = createSecrets(store.sql, secretKey, "plugin_secrets");
  const plugins = new Map<string, Package>();
  const add = (record: PackageRecord) => plugins.set(record.id, { record, log: [], saved: {}, settings: {}, skills: [], given: new Map() }).get(record.id)!;
  const anyGiven = () => [...plugins.values()].some((plugin) => plugin.given.size > 0);
  for (const record of await store.plugins.list()) if (record.kind === "package") add(record as PackageRecord);
  const on = new Map<string, Set<string>>();
  for (const { profileId, pluginId } of await store.plugins.on()) if (plugins.has(pluginId)) on.set(pluginId, (on.get(pluginId) ?? new Set()).add(profileId));
  const get = (id: string) => plugins.get(id) ?? fail(404, "plugin not found");
  const folders = new Set(dirs.map((dir) => resolve(dir)));
  // A local plugin runs from its folder; one from GitHub from its commit's files, in FXBOT_DATA/plugins/<name>/.
  const folderOf = (record: PackageRecord) => ("local" in record.source ? record.source.local : resolve(dataDir, "plugins", record.name, record.source.commit));
  const marks = new Map<string, PluginMark>();
  // A commit the hourly check found the plugin unchanged at, so it isn't read again.
  const same = new Map<string, string>();

  function write(plugin: Package, line: string) {
    plugin.log.push(`${new Date().toISOString()} ${line}`);
    if (plugin.log.length > 100) plugin.log.shift();
    console.log(`[plugin ${plugin.record.name}] ${line}`);
  }
  const report = (plugin: Package, what: string, error: unknown) => write(plugin, `${what} failed: ${said(error)}`);

  // A plugin's hooks and tools reach a bot when it runs, is on, and is for that bot.
  const applies = (plugin: Package, bot: string) => Boolean(plugin.loaded && plugin.record.enabled && (plugin.record.bots === "all" || on.get(plugin.record.id)?.has(bot)));
  const hooked = (event: keyof HookEvents) => [...plugins.values()].some((p) => p.loaded?.hooks.get(event)?.length);
  const named = (name: string) => [...plugins.values()].find((p) => p.record.name === name);
  // A manifest stored before needs existed has none.
  const needsOf = (record: PackageRecord) => Object.keys(record.config.needs ?? {});

  // The added plugins that need `name`, each with its block for it, a copy, so a plugin can't change another's, and the
  // object it provides, its own.
  const dependentsOf = (name: string): Dependent[] =>
    [...plugins.values()].flatMap(({ record, loaded }) =>
      record.config.needs?.[name] ? [{ name: record.name, version: record.config.version, needs: structuredClone(record.config.needs[name]), api: loaded?.api ?? null }] : [],
    );
  // Tells each named plugin that runs who needs it now.
  async function tell(names: Iterable<string>) {
    for (const name of new Set(names)) {
      const plugin = named(name);
      for (const handler of plugin?.loaded?.hooks.get("dependents") ?? [])
        await within(() => handler({ dependents: dependentsOf(name) }), limit, "A dependents hook").catch((error) => report(plugin!, "A dependents hook", error));
    }
  }

  // A folder of FXBOT_PLUGIN_DIRS is added on first sight, and its manifest read again at every start. A new one's
  // servers are added when the plugins start.
  const fresh: { plugin: Package; servers: Server[] }[] = [];
  for (const folder of folders) {
    try {
      const manifest = parseManifest(await readFile(resolve(folder, "plugin.json"), "utf8"));
      const same = [...plugins.values()].find((p) => p.record.name === manifest.name);
      if (same && folderOf(same.record) !== folder) throw new Error(`a plugin named ${manifest.name} is added already`);
      if (same) {
        const config = { ...manifest, servers: same.record.config.servers };
        same.record = { ...same.record, config };
        await store.plugins.update(same.record.id, { config });
        continue;
      }
      const record: PackageRecord = { id: newId(), kind: "package", name: manifest.name, source: { local: folder }, config: manifest, approvedHash: "", enabled: true, bots: "all", allowed: null, status: null };
      await store.plugins.create(record);
      fresh.push({ plugin: add(record), servers: serversIn(await readFile(resolve(folder, "mcp.json"), "utf8").catch(() => undefined)) });
    } catch (error) {
      console.error(`fxbot could not add the plugin in ${folder}: ${said(error)}`);
    }
  }

  // Each remote server its mcp.json names, added as an MCP plugin. One that can't be added is logged.
  async function addServers(plugin: Package, servers: Server[], allowLocal: boolean) {
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
    await store.plugins.update(plugin.record.id, { config: plugin.record.config });
  }

  // The skills in its skills/ folder, as the skills.sh layout has them: skills/<name>/SKILL.md, with its other files.
  async function skillsIn(plugin: Package, folder: string): Promise<Row[]> {
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
      rows.push({ pluginId: plugin.record.id, name: parsed.name, description: parsed.description, instructions: parsed.body, resources, manual: parsed.manual });
    }
    return rows;
  }

  // A plugin's page at its repository's current commit, or at `commit`, and the files Add would write.
  async function look(ref: RepoRef, commit?: string) {
    const text = typeof ref?.repo === "string" ? ref.repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "") : "";
    const [, repo, path = ""] = refOf.exec(text) ?? fail(400, "plugin must be <owner>/<repo>, or <owner>/<repo>/<folder>");
    if (path && path.split("/").some((part) => !part || part === "." || part === "..")) fail(400, "The plugin's folder must be a path inside the repository.");
    const at = commit ?? (await archives.head(repo).catch((error: Error) => fail(502, error.message)));
    const all = await archives.files(repo, at, maxFile).catch((error: Error) => fail(502, error.message));
    const inside = (p: string) => !path || p.startsWith(`${path}/`);
    const relative = (p: string) => (path ? p.slice(path.length + 1) : p);
    const files = [...all.text].filter(([p]) => inside(p)).map(([p, t]) => [relative(p), t] as [string, string]).sort(([a], [b]) => (a < b ? -1 : 1));
    const skipped = [...all.skipped].filter(([p]) => inside(p)).map(([p, why]) => ({ path: relative(p), why }));
    const { page, manifest } = pageOf(files, skipped, { repo, path, commit: at, from: ref.from === "fxbot" ? "fxbot" : "github" }, `${repo}${path ? `/${path}` : ""}`);
    if (page.error) return { page, files };
    const problem = unfit(manifest!, page.code.map((p) => page.texts[p]).join("\n"), version, breaks());
    if (problem) return { page: { ...page, error: fitSaid(problem, version), unfit: true, ...("needs" in problem ? { needsFxbot: problem.needs } : {}) }, files };
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

  // A plugin's page from its files: what it is, what runs inside fxbot, and the rest it carries. `where` names it in
  // errors: its repository and folder, or its folder on this machine.
  function pageOf(files: [string, string][], skipped: PackagePreview["skipped"], source: PackageSource, where: string): { page: PackagePreview; manifest?: Manifest } {
    const page: PackagePreview = {
      hash: "",
      name: "",
      iconKey: "",
      version: "",
      description: "",
      source,
      files: files.map(([p, t]) => ({ path: p, size: Buffer.byteLength(t), hash: sha(t).slice(0, 12) })),
      skipped,
      code: [],
      texts: {},
      settings: [],
      migrations: [],
      skills: [],
      needs: [],
      servers: [],
    };
    const byPath = new Map(files);
    if (!byPath.has("plugin.json")) return { page: { ...page, error: `${where} has no plugin.json${"commit" in source ? ` at ${source.commit.slice(0, 7)}` : ""}.` } };
    page.texts["plugin.json"] = byPath.get("plugin.json")!;
    let manifest: Manifest;
    try {
      manifest = parseManifest(byPath.get("plugin.json")!);
    } catch (error) {
      return { page: { ...page, error: said(error) } };
    }
    const owner = "repo" in source ? source.repo.split("/")[0] : "local";
    Object.assign(page, { name: manifest.name, iconKey: `${owner}/${manifest.name}`, version: manifest.version, description: manifest.description, settings: manifest.settings });
    page.needs = Object.keys(manifest.needs).map((name) => ({ name, added: Boolean(named(name)) }));
    page.code = [manifest.server, manifest.page].filter((p): p is string => Boolean(p));
    const missing = [...page.code, manifest.css].filter((p) => p && !byPath.has(p));
    if (missing.length) return { page: { ...page, error: `plugin.json names ${missing.join(" and ")}, which ${where} doesn't have.` } };
    page.migrations = manifest.migrations ? files.map(([p]) => p).filter((p) => p.startsWith(`${manifest.migrations}/`) && p.endsWith(".sql")) : [];
    for (const p of [...page.code, ...(manifest.css ? [manifest.css] : []), ...page.migrations]) page.texts[p] = byPath.get(p)!;
    page.skills = files.flatMap(([p, t]) => (/^skills\/[^/]+\/SKILL\.md$/.test(p) ? [((parsed) => ("error" in parsed ? `${p.split("/")[1]} (${parsed.error})` : parsed.name))(parseSkill(t))] : []));
    page.servers = serversIn(byPath.get("mcp.json")).map(({ name, url }) => ({ name, ...(url ? { url } : {}), used: Boolean(url) }));
    if (page.files.reduce((n, f) => n + f.size, 0) > maxPlugin) return { page: { ...page, error: `It is over ${maxPlugin / 1000 / 1000} MB.` } };
    page.hash = sha(JSON.stringify(files));
    return { page, manifest };
  }

  // An installed plugin's files, from its folder: text up to maxFile each, leaving out dot folders and node_modules.
  async function folderFiles(root: string) {
    const files: [string, string][] = [];
    const skipped: PackagePreview["skipped"] = [];
    const utf8 = new TextDecoder("utf-8", { fatal: true });
    async function walk(dir: string) {
      for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") await walk(path);
        } else if (!entry.isFile()) skipped.push({ path, why: "a link" });
        else if ((await stat(join(root, path))).size > maxFile) skipped.push({ path, why: `over ${maxFile / 1024} KiB` });
        else {
          try {
            files.push([path, utf8.decode(await readFile(join(root, path)))]);
          } catch {
            skipped.push({ path, why: "not text" });
          }
        }
      }
    }
    await walk("");
    return { files: files.sort(([a], [b]) => (a < b ? -1 : 1)), skipped };
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
      const looked = await look({ repo: `${source.repo}${source.path ? `/${source.path}` : ""}`, from: source.from }, head).catch(() => null);
      if (!looked) continue;
      if (looked.page.error?.includes("has no plugin.json")) marks.set(id, { kind: "removed" });
      else if (looked.page.needsFxbot) marks.set(id, { kind: "needs", version: looked.page.needsFxbot });
      else if (!looked.page.unfit && looked.page.hash && looked.page.hash !== approvedHash) marks.set(id, { kind: "update", version: head.slice(0, 7) });
      else (marks.delete(id), same.set(id, head));
    }
  }
  const timer = setInterval(() => void check().catch(() => {}), hour);
  timer.unref();
  const first = setTimeout(() => void check().catch(() => {}), 60_000);
  first.unref();

  // A local plugin loads again a moment after its files change, so its author sees each change without a restart.
  const watchers: FSWatcher[] = [];
  async function reload(plugin: Package) {
    if (plugins.get(plugin.record.id) !== plugin || !plugin.record.enabled) return;
    const before = needsOf(plugin.record);
    try {
      const manifest = parseManifest(await readFile(resolve(folderOf(plugin.record), "plugin.json"), "utf8"));
      if (manifest.name !== plugin.record.name) throw new Error(`plugin.json now names ${manifest.name}. Restart fxbot to add it.`);
      plugin.record = { ...plugin.record, config: manifest };
      await store.plugins.update(plugin.record.id, { config: manifest });
    } catch (error) {
      return report(plugin, "Loading it again", error);
    }
    await unload(plugin);
    await load(plugin);
    await tell([...before, ...needsOf(plugin.record)]);
    onChange();
  }
  function watchFolder(plugin: Package) {
    let wait: NodeJS.Timeout | undefined;
    try {
      const watcher = watch(folderOf(plugin.record), { recursive: true }, () => {
        clearTimeout(wait);
        wait = setTimeout(() => void reload(plugin), 300);
      });
      watcher.unref();
      watchers.push(watcher);
    } catch (error) {
      report(plugin, "Watching its folder", error);
    }
  }

  // The defaults, then what the owner set, kept in the same object, which the plugin holds.
  function settle(plugin: Package) {
    for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
    for (const { name, default: value } of plugin.record.config.settings) if (value !== undefined) plugin.settings[name] = value;
    Object.assign(plugin.settings, plugin.saved);
  }

  // Its schema, then each of its migrations it hasn't run, in name order, each in a transaction. The names run are kept
  // in the schema's _migrations.
  async function migrate(plugin: Package, sql: Sql, folder: string) {
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
  const codeOf = async (record: PackageRecord) =>
    (await Promise.all([record.config.server, record.config.page].filter((p): p is string => Boolean(p)).map((p) => readFile(resolve(folderOf(record), p), "utf8").catch(() => "")))).join("\n");

  async function load(plugin: Package) {
    const { record } = plugin;
    // Before its migrations and its code. A local plugin's author is at the keyboard, and a branch's version trails it.
    const problem = unfit(record.config, await codeOf(record), version, breaks());
    const why = problem && fitSaid(problem, version);
    plugin.unsupported = "repo" in record.source ? why : undefined;
    if (why) write(plugin, plugin.unsupported ? why : `${why} It's local, so it runs.`);
    if (plugin.unsupported) return void (plugin.error = undefined);
    const loaded: Loaded = { hooks: new Map(), tools: [], routes: [], sockets: [], open: new Set(), controller: new AbortController() };
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
      socket(path, handler) {
        if (typeof path !== "string" || !path.startsWith("/") || typeof handler !== "function") throw new Error("A socket needs a path that starts with / and a handler.");
        loaded.sockets.push({ path, parts: path.split("/").filter(Boolean), handler });
      },
      sql: undefined as never,
      settings: plugin.settings,
      bots: { ...host.bots, on: (bot) => applies(plugin, bot) },
      timeZone: host.timeZone,
      dependents: () => dependentsOf(record.name),
      provide(offer) {
        if (!offer || typeof offer !== "object") throw new Error("provide takes an object.");
        loaded.api = offer;
      },
      need(name) {
        if (!record.config.needs?.[name]) throw new Error(`${record.name} doesn't name ${name} under needs.`);
        return (named(name)?.loaded?.api ?? null) as never;
      },
      library: host.library,
      skills: {
        files: host.skills.files,
        set(bot, list) {
          const refuse = (message: string): never => {
            throw Object.assign(new Error(message), { status: 400 });
          };
          if (!Array.isArray(list)) refuse("skills.set takes a list of skills.");
          const rows = list.map((skill): Row => {
            const problem = skillProblem(skill?.name, skill?.description);
            if (problem) refuse(problem);
            if (typeof skill.instructions !== "string" || Buffer.byteLength(skill.instructions) > 64 * 1024) refuse("A skill's instructions must be text, up to 64 KiB.");
            return { pluginId: record.id, name: skill.name, description: skill.description.trim(), instructions: skill.instructions, resources: [], manual: false };
          });
          if (new Set(rows.map((row) => row.name)).size !== rows.length) refuse("Each skill needs a name of its own.");
          const had = anyGiven();
          if (rows.length) plugin.given.set(bot, rows);
          else plugin.given.delete(bot);
          // The skill tool comes and goes with the first skill and the last; the catalog is read at each turn.
          if (had !== anyGiven()) onChange();
        },
      },
      memories: host.memories,
      models: host.models,
      machine: host.machine,
      chats: {
        newSession: (bot) => host.chats.newSession(record.name, bot),
        send: (bot, message) => host.chats.send(record.name, bot, message),
        stream: (bot, session, cursor) => host.chats.stream(record.name, bot, session, cursor),
        ownerSaid: host.chats.ownerSaid,
        cancel: (bot, session) => host.chats.cancel(record.name, bot, session),
      },
      log: (...parts) => write(plugin, parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")),
      signal: loaded.controller.signal,
    };
    try {
      if ("local" in record.source && !folders.has(folderOf(record))) throw new Error("Its folder isn't in FXBOT_PLUGIN_DIRS any more.");
      if ([...reserved, ...taken()].includes(record.name)) throw new Error(`Its name, ${record.name}, is a prefix another plugin's tools use.`);
      const missing = needsOf(record).filter((name) => !named(name));
      if (missing.length) throw new Error(`It needs ${missing.join(" and ")}. Add ${missing.length > 1 ? "them" : "it"} first.`);
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

  async function unload(plugin: Package) {
    const loaded = plugin.loaded;
    if (!loaded) return;
    plugin.loaded = undefined;
    plugin.skills = [];
    plugin.given.clear();
    loaded.controller.abort();
    for (const socket of loaded.open) socket.close(1001, "The plugin stopped.");
    await within(() => loaded.cleanup?.(), limit, "Its cleanup").catch((error) => report(plugin, "Cleanup", error));
    await loaded.sql?.end({ timeout: 5 });
  }

  // A hook's handlers, plugin by plugin, for the event's bot. A message hook may handle the message, and a tool.before
  // hook may block the call; either ends the run with its answer. A message hook may also ask to start the chat over:
  // the first such answer counts, and the other hooks still run. A handler that throws or runs late is logged and
  // skipped, except before a tool call, where it blocks, so a broken guard never lets a call through.
  async function run<E extends keyof HookEvents>(event: E, payload: HookEvents[E] & { bot: string }): Promise<{ handled?: true; block?: string; startOver?: { ask: string }; waits?: Wait[] } | undefined> {
    let startOver: { ask: string } | undefined;
    const waits: Wait[] = [];
    for (const plugin of plugins.values()) {
      if (!applies(plugin, payload.bot)) continue;
      for (const handler of plugin.loaded!.hooks.get(event) ?? []) {
        try {
          const answer = (await within(() => handler(payload), limit, `A ${event} hook`)) as { handled?: unknown; block?: unknown; startOver?: { ask?: unknown }; wait?: unknown } | undefined;
          if (event === "message" && answer?.handled === true) return { handled: true };
          if (event === "tool.before" && typeof answer?.block === "string") return { block: answer.block };
          if (event === "tool.before" && typeof answer?.wait === "function") waits.push(answer.wait as Wait);
          if (event === "message" && answer?.startOver && !startOver) {
            const ask = answer.startOver.ask;
            if (typeof ask === "string" && ask.trim() && Buffer.byteLength(ask) <= 16 * 1024) startOver = { ask };
            else report(plugin, "A message hook", new Error("startOver needs an ask of 1 to 16 KiB of text."));
          }
        } catch (error) {
          report(plugin, `A ${event} hook`, error);
          if (event === "tool.before") return { block: `${plugin.record.name} stopped this call: ${said(error)}` };
        }
      }
    }
    return startOver || waits.length ? { ...(startOver ? { startOver } : {}), waits } : undefined;
  }

  // turn.start and turn.end only observe, so they never hold up a turn.
  function observe<E extends "turn.start" | "turn.end">(event: E, payload: HookEvents[E]) {
    for (const plugin of plugins.values())
      if (applies(plugin, payload.bot))
        for (const handler of plugin.loaded!.hooks.get(event) ?? []) void within(() => handler(payload), 60_000, `A ${event} hook`).catch((error) => report(plugin, `A ${event} hook`, error));
  }

  // Every tool, core and plugin alike, passes through the tool hooks. With none, it runs as it is.
  function wrap(tool: FxAgentTool, safe = false): FxAgentTool {
    if (tool.providerExecuted) return tool;
    const { execute } = tool;
    return {
      ...tool,
      async execute(input, context) {
        if (!hooked("tool.before") && !hooked("tool.after")) return execute(input, context);
        const { bot = "", messageId = "" } = (context.context ?? {}) as { bot?: string; messageId?: string };
        const call = { bot, session: context.sessionId, messageId, callId: context.executionId, tool: tool.name, description: tool.description ?? "", input, safe };
        const answer = await run("tool.before", call);
        if (answer?.block) throw new Error(answer.block);
        // A wait outlasts a hook's time, for a person or a model, and ends with the call.
        for (const wait of answer?.waits ?? []) {
          const stopped = new Promise<never>((_, fail) => context.signal.addEventListener("abort", () => fail(new Error("The turn was stopped.")), { once: true }));
          const verdict = await Promise.race([wait({ input: call.input }), stopped]);
          if (verdict?.block) throw new Error(verdict.block);
        }
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
  function toolsOf(plugin: Package): FxAgentTool[] {
    return (plugin.loaded?.tools ?? []).map((tool) => wrap({
      name: `${plugin.record.name}_${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema as FxAgentHostTool["inputSchema"],
      idempotent: tool.idempotent,
      async execute(input, context) {
        const { bot, messageId = "" } = (context.context ?? {}) as { bot?: string; messageId?: string };
        if (!bot || !applies(plugin, bot)) throw new Error(`${plugin.record.name} is off for this bot.`);
        return tool.execute(input, { bot, session: context.sessionId, messageId, signal: context.signal });
      },
    }, tool.safe === true));
  }

  // Who made a plugin, for its icon: its repository's owner, or for a checkout's folder, the owner of fxbot's list entry
  // with its name, so it looks as released.
  const iconKeyOf = (record: PackageRecord) => `${"repo" in record.source ? record.source.repo.split("/")[0] : (listedOwner(record.name) ?? "local")}/${record.name}`;

  function view(plugin: Package): PackagePlugin {
    const { record, loaded } = plugin;
    return {
      id: record.id,
      kind: "package",
      name: record.name,
      iconKey: iconKeyOf(record),
      enabled: record.enabled,
      bots: record.bots,
      on: [...(on.get(record.id) ?? [])],
      status: "",
      source: record.source,
      version: record.config.version,
      description: record.config.description,
      files: record.config.files ?? [],
      servers: record.config.servers ?? [],
      code: Boolean(record.config.server || record.config.page),
      skills: plugin.skills.map((row) => row.name),
      needs: needsOf(record),
      settings: record.config.settings.map((setting) => ({
        ...setting,
        set: setting.name in plugin.saved,
        ...(setting.isSecret || !(setting.name in plugin.saved) ? {} : { value: plugin.saved[setting.name] }),
      })),
      parts: {
        tools: (loaded?.tools ?? []).map((t) => `${record.name}_${t.name}`),
        hooks: [...(loaded?.hooks.keys() ?? [])],
        routes: (loaded?.routes ?? []).map((r) => `${r.method} ${r.path}`),
        sockets: (loaded?.sockets ?? []).map((s) => s.path),
        page: Boolean(record.config.page),
      },
      ...(plugin.error ? { error: plugin.error } : {}),
      ...(plugin.unsupported ? { unsupported: plugin.unsupported } : {}),
      ...(marks.has(record.id) ? { mark: marks.get(record.id) } : {}),
    };
  }

  async function save(plugin: Package, fields: Partial<Pick<PackageRecord, "enabled" | "bots">>) {
    plugin.record = { ...plugin.record, ...fields };
    await store.plugins.update(plugin.record.id, fields);
  }

  return {
    has: (id: string) => plugins.has(id),
    names: () => [...plugins.values()].map((p) => p.record.name),
    // Loads every plugin that's on, each after the ones it needs, and otherwise in the order they were added. A local
    // plugin being written may point at servers on this machine.
    async start() {
      for (const { plugin, servers } of fresh) await addServers(plugin, servers, true);
      for (const plugin of plugins.values()) if ("local" in plugin.record.source && folders.has(folderOf(plugin.record))) watchFolder(plugin);
      const order: Package[] = [];
      const visit = (plugin: Package, path: Set<Package>) => {
        if (order.includes(plugin) || path.has(plugin)) return;
        path.add(plugin);
        for (const name of needsOf(plugin.record)) if (named(name)) visit(named(name)!, path);
        order.push(plugin);
      };
      for (const plugin of plugins.values()) visit(plugin, new Set());
      for (const plugin of order) {
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
        pages.push({ name: record.name, iconKey: iconKeyOf(record), version, ...(await url(page)), ...(await url(css)) });
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
    // The plugin's socket for `/api/plugins/<name>/<path>`: a function that hands it an open WebSocket, or a 404 before
    // anything is upgraded. A handler that throws closes the socket, and the error goes in the plugin's log.
    socket(name: string, path: string) {
      const plugin = [...plugins.values()].find((p) => p.record.name === name && p.loaded && p.record.enabled) ?? fail(404, `No plugin named ${name} is running.`);
      const segments = path.split("/").filter(Boolean);
      for (const target of plugin.loaded!.sockets) {
        const params = match(target.parts, segments);
        if (!params) continue;
        return (socket: PluginSocket, request: Request) => {
          const loaded = plugin.loaded;
          if (!loaded) return socket.close(1001, "The plugin stopped.");
          loaded.open.add(socket);
          const closed = socket.onclose;
          socket.onclose = () => (loaded.open.delete(socket), closed?.());
          Promise.resolve()
            .then(() => target.handler(socket, request, params))
            .catch((error) => (report(plugin, `The socket ${target.path}`, error), socket.close(1011, "The plugin failed.")));
        };
      }
      return fail(404, "not found");
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
      const fields = { ...(enabled === undefined ? {} : { enabled }), ...(input.bots ? { bots: input.bots as "all" | "each" } : {}) };
      await save(plugin, fields);
      for (const server of plugin.record.config.servers ?? []) await host.changeServer(server, fields).catch((error) => report(plugin, "Changing its MCP server", error));
      if (enabled === false) await unload(plugin);
      if (enabled === true && !plugin.loaded) await load(plugin);
      onChange();
      return view(plugin);
    },
    async forBot(profileId: string, pluginId: string, enabled: unknown) {
      const plugin = get(pluginId);
      if (typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      await store.plugins.forBot(profileId, pluginId, enabled as boolean);
      const bots = on.get(pluginId) ?? new Set<string>();
      if (enabled) bots.add(profileId);
      else bots.delete(profileId);
      on.set(pluginId, bots);
      for (const server of plugin.record.config.servers ?? []) await host.serverForBot(profileId, server, enabled as boolean).catch((error) => report(plugin, "Choosing bots for its MCP server", error));
      return view(plugin);
    },
    // Its cleanup runs, then its schema, its sessions, its settings, its switches, its servers, and its files go.
    async remove(id: string) {
      const plugin = get(id);
      const needing = dependentsOf(plugin.record.name).map((d) => d.name);
      if (needing.length) fail(409, `${needing.join(" and ")} ${needing.length > 1 ? "need" : "needs"} ${plugin.record.name}. Remove ${needing.length > 1 ? "them" : "it"} first.`);
      await unload(plugin);
      plugins.delete(id);
      on.delete(id);
      marks.delete(id);
      await store.sql.unsafe(`drop schema if exists "${schemaOf(plugin.record.name)}" cascade`);
      await store.sql`delete from plugin_sessions where plugin = ${plugin.record.name}`;
      await store.plugins.remove(id);
      secrets.forget(id);
      for (const server of plugin.record.config.servers ?? []) await host.removeServer(server).catch(() => {});
      if (!("local" in plugin.record.source)) await rm(resolve(dataDir, "plugins", plugin.record.name), { recursive: true, force: true });
      await tell(needsOf(plugin.record));
      onChange();
    },

    // The skills running plugins carry, for the bots each is on for.
    // The commands of the plugins that run for this bot, for its `/` list.
    commands: (bot: string) => [...plugins.values()].flatMap((plugin) => (applies(plugin, bot) ? (plugin.record.config.commands ?? []) : [])),
    carried: (): CarriedSkill[] =>
      [...plugins.values()].flatMap((plugin) => [
        ...plugin.skills.map((row) => ({ id: `${plugin.record.name}/${row.name}`, row, applies: (bot: string) => applies(plugin, bot) })),
        ...[...plugin.given].flatMap(([bot, rows]) => rows.map((row) => ({ id: `${plugin.record.name}/${row.name}`, row, applies: (b: string) => b === bot && applies(plugin, b) }))),
      ]),

    preview: async (ref: RepoRef) => (await look(ref)).page,
    // An installed plugin's page, from the files it runs: its commit's for one from GitHub, its folder's for a local one.
    async contents(id: string) {
      const { record } = get(id);
      const { files, skipped } = await folderFiles(folderOf(record)).catch((error: Error) => fail(404, `Its files can't be read: ${error.message}`));
      const { page } = pageOf(files, skipped, record.source, "repo" in record.source ? `${record.source.repo}${record.source.path ? `/${record.source.path}` : ""}` : record.source.local);
      return { ...page, iconKey: iconKeyOf(record) };
    },
    // Writes the files the page showed, makes its schema, adds its remote servers, and loads it.
    async add(ref: RepoRef, hash: unknown) {
      const { page, files, manifest } = await look(ref);
      if (page.error || !manifest) return fail(400, page.error ?? "This plugin can't be added.");
      if (page.hash !== hash) fail(409, "The plugin changed since its page was shown. Look at it again.");
      if ([...plugins.values()].some((p) => p.record.name === manifest.name)) fail(409, `A plugin named ${manifest.name} is added already.`);
      if ([...reserved, ...taken()].includes(manifest.name)) fail(400, `Its name, ${manifest.name}, is a prefix another plugin's tools use.`);
      const missing = page.needs.filter((need) => !named(need.name)).map((need) => need.name);
      if (missing.length) fail(400, `Add ${missing.join(" and ")} first.`);
      const record: PackageRecord = {
        id: newId(),
        kind: "package",
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
      await store.plugins.create(record);
      const plugin = add(record);
      await addServers(plugin, serversIn(new Map(files).get("mcp.json")), false);
      await load(plugin);
      await tell(needsOf(record));
      onChange();
      return view(plugin);
    },
    // Moves it to its repository's current commit, the one its page showed. A version that doesn't load leaves the old
    // one running.
    async update(id: string, hash: unknown) {
      const plugin = get(id);
      const before = plugin.record;
      if (!("repo" in before.source)) return fail(400, "A local plugin runs from its folder. Restart fxbot to load it again.");
      const { page, files, manifest } = await look({ repo: `${before.source.repo}${before.source.path ? `/${before.source.path}` : ""}`, from: before.source.from });
      if (page.error || !manifest) return fail(400, page.error ?? "This version can't be added.");
      if (page.hash !== hash) fail(409, "The plugin changed since its page was shown. Look at it again.");
      if (manifest.name !== before.name) fail(400, `This version is named ${manifest.name}. Remove ${before.name} and add it instead.`);
      const missing = page.needs.filter((need) => !named(need.name)).map((need) => need.name);
      if (missing.length) fail(400, `This version needs ${missing.join(" and ")}. Add ${missing.length > 1 ? "them" : "it"} first.`);
      const next: PackageRecord = { ...before, source: page.source, config: { ...manifest, files: page.files, servers: before.config.servers }, approvedHash: page.hash };
      if (folderOf(next) !== folderOf(before)) await writeFiles(folderOf(next), files);
      await unload(plugin);
      plugin.record = next;
      await load(plugin);
      if (!plugin.loaded) {
        const error = plugin.error;
        plugin.record = before;
        await load(plugin);
        if (folderOf(next) !== folderOf(before)) await rm(folderOf(next), { recursive: true, force: true });
        return fail(400, `${("commit" in page.source ? page.source.commit : "").slice(0, 7)} didn't load, so ${before.name} stays at ${before.source.commit.slice(0, 7)}: ${error}`);
      }
      await store.plugins.update(id, { source: next.source, config: next.config, approvedHash: next.approvedHash });
      if (folderOf(next) !== folderOf(before)) await rm(folderOf(before), { recursive: true, force: true });
      marks.delete(id);
      await tell([...needsOf(before), ...needsOf(next)]);
      onChange();
      return view(plugin);
    },
    check,
    // After the published list of breaks changes: a plugin it now fits stops, and one it no longer fits runs again.
    async recheck() {
      for (const plugin of plugins.values()) {
        const { record } = plugin;
        if (!record.enabled || !("repo" in record.source) || Boolean(unfit(record.config, await codeOf(record), version, breaks())) === Boolean(plugin.unsupported)) continue;
        await unload(plugin);
        await load(plugin);
        onChange();
      }
    },
    // The plugins running now that wouldn't on a version of fxbot, for Settings to say before an update.
    async wontRun(next: string) {
      const running = [...plugins.values()].filter(({ record, loaded }) => loaded && "repo" in record.source);
      const stops = await Promise.all(running.map(async ({ record }) => Boolean(unfit(record.config, await codeOf(record), next, breaks()))));
      return running.filter((_, i) => stops[i]).map(({ record }) => record.name);
    },

    async close() {
      clearInterval(timer);
      clearTimeout(first);
      for (const watcher of watchers) watcher.close();
      for (const plugin of plugins.values()) await unload(plugin);
    },
  };
}

export type Plugins = Awaited<ReturnType<typeof createPlugins>>;
