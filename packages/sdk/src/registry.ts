import { readFileSync } from "node:fs";
import type { Sql } from "./store.ts";
import type { McpCard, RegistryFrom, RegistryInfo, PluginMark, McpSearch, PackageCard, PackageSearch, SkillCard, SkillSearch } from "./types.ts";

type Fetch = typeof fetch;
const hour = 60 * 60 * 1000;
const cacheMs = 5 * 60 * 1000;
const official = "io.modelcontextprotocol.registry/official";
const publisher = "io.modelcontextprotocol.registry/publisher-provided";
// fxbot's own list is kept under this source, whichever copy it came from.
const ours = "fxbot";

// A registry entry as the v0.1 API serves it, as far as fxbot reads it.
export type Entry = {
  server: {
    name: string;
    title?: string;
    description?: string;
    version: string;
    websiteUrl?: string;
    repository?: { url?: string };
    remotes?: { type: string; url: string; headers?: { name: string; description?: string; isSecret?: boolean }[] }[];
    packages?: unknown[];
    _meta?: Record<string, { github?: { displayName?: string; stargazerCount?: number; license?: string; homepageUrl?: string; readme?: string } } | undefined>;
  };
  _meta?: Record<string, { status?: string } | undefined>;
};

const github = (entry: Entry) => entry.server._meta?.[publisher]?.github;
const valid = (entry: Entry) => typeof entry?.server?.name === "string" && typeof entry.server.version === "string";

// A reverse-DNS namespace names a domain: app.linear is linear.app. One under io.github is a GitHub account, which the
// registry checks by sign-in, and a plain name, as in GitHub's registry, names a repository's owner.
function domainOf(namespace: string) {
  return namespace.includes(".") && !namespace.startsWith("io.github.") ? namespace.split(".").reverse().join(".") : undefined;
}

export function infoOf(entry: Entry, from: RegistryFrom): RegistryInfo {
  const { server } = entry;
  const repo = github(entry);
  const namespace = server.name.split("/")[0];
  const status = entry._meta?.[official]?.status;
  return {
    name: server.name,
    namespace,
    ...(domainOf(namespace) ? { domain: domainOf(namespace) } : {}),
    title: server.title || repo?.displayName || server.name.split("/").at(-1)!,
    description: (server.description ?? "").slice(0, 500),
    version: server.version,
    ...(server.repository?.url ? { repository: server.repository.url } : {}),
    ...(server.websiteUrl || repo?.homepageUrl ? { website: server.websiteUrl || repo?.homepageUrl } : {}),
    ...(repo?.license ? { license: repo.license } : {}),
    ...(typeof repo?.stargazerCount === "number" ? { stars: repo.stargazerCount } : {}),
    status: status === "deprecated" || status === "deleted" ? status : "active",
    from,
  };
}

export function cardOf(entry: Entry, from: RegistryFrom): McpCard {
  const info = infoOf(entry, from);
  const remote = entry.server.remotes?.find((r) => r.type === "streamable-http" || r.type === "sse");
  const host = remote && URL.canParse(remote.url) ? new URL(remote.url).hostname : undefined;
  return {
    ...info,
    kind: "mcp",
    iconKey: entry.server.name,
    ...(host ? { url: remote!.url, host } : {}),
    ...(host && info.domain ? { hostMatches: host === info.domain || host.endsWith(`.${info.domain}`) } : {}),
    ...(remote?.headers?.some((h) => h.isSecret) ? { needs: "key" as const } : {}),
    ...(!remote && entry.server.packages?.length ? { local: true } : {}),
  };
}

// fxbot's own list, as this release shipped it: one page of the registry's `/v0.1/servers`, in its format.
const shipped = () => (JSON.parse(readFileSync(new URL("./mcp-registry.json", import.meta.url), "utf8")) as { servers: Entry[] }).servers;

// A skill as skills.sh lists it, `<owner>/<repo>/<skillId>` from a GitHub repository. fxbot's skills list adds a
// description, which skills.sh doesn't give.
export type SkillEntry = { id: string; source: string; skillId: string; name: string; description?: string; installs?: number };
const skillId = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;
const skillEntry = (e: SkillEntry) =>
  typeof e?.id === "string" && skillId.test(e.id) && e.id === `${e.source}/${e.skillId}` && typeof e.name === "string" && (e.description === undefined || typeof e.description === "string");
const shippedSkills = () => (JSON.parse(readFileSync(new URL("./skills-registry.json", import.meta.url), "utf8")) as { skills: SkillEntry[] }).skills.filter(skillEntry);
const skillCard = (e: SkillEntry, from: SkillCard["from"]): SkillCard => ({
  kind: "skill",
  id: e.id,
  name: e.name.slice(0, 64),
  iconKey: `${e.source.split("/")[0]}/${e.skillId}`,
  repository: e.source,
  from,
  ...(e.description ? { description: e.description.slice(0, 1024) } : {}),
  ...(typeof e.installs === "number" ? { installs: e.installs } : {}),
});

// A plugin in fxbot's plugins list: its GitHub repository, and the folder it is in, if it isn't the repository's root.
export type PluginEntry = { name: string; description: string; repo: string; path?: string };
const pluginEntry = (e: PluginEntry) =>
  typeof e?.name === "string" && typeof e.description === "string" && typeof e.repo === "string" && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(e.repo) && (e.path === undefined || typeof e.path === "string");
const shippedPlugins = () => (JSON.parse(readFileSync(new URL("./plugins-registry.json", import.meta.url), "utf8")) as { plugins: PluginEntry[] }).plugins.filter(pluginEntry);

// Three sources of MCP servers. fxbot's own list ships with each release, and with `fxbotUrl`, its published copy
// replaces it every hour. GitHub's registry is mirrored into Postgres every hour, so that search stays on this
// machine: every page the first time, then what changed since the last sync began. A rate limit or a 429 waits until
// the registry says. A failed sync keeps what it had. The official registry is searched only when asked, once per
// search, for 5 minutes. A server in more than one shows once, from fxbot's list first.
// Skills come from fxbot's skills list, kept in memory and read again every hour when it is published, and from
// skills.sh's search, asked once per search. Plugins come from fxbot's plugins list, kept the same way.
export function createRegistry({
  sql,
  fetch,
  mirrorUrl,
  everythingUrl,
  fxbotUrl,
  fxbotList = shipped(),
  skillsUrl = "https://skills.sh",
  fxbotSkillsUrl,
  fxbotSkills = shippedSkills(),
  fxbotPluginsUrl,
  fxbotPlugins = shippedPlugins(),
  mirrorWanted = async () => true,
}: {
  sql: Sql;
  fetch: Fetch;
  mirrorUrl: string;
  everythingUrl: string;
  fxbotUrl?: string;
  fxbotList?: Entry[];
  skillsUrl?: string;
  fxbotSkillsUrl?: string;
  fxbotSkills?: SkillEntry[];
  fxbotPluginsUrl?: string;
  fxbotPlugins?: PluginEntry[];
  /** Whether GitHub's registry should be mirrored: while unvetted plugins show, or a server from it is installed. */
  mirrorWanted?: () => Promise<boolean>;
}) {
  let ourSkills = fxbotSkills;
  let ourPlugins = fxbotPlugins;
  const skillSearches = new Map<string, { at: number; entries: SkillEntry[] }>();
  let notBefore = 0;
  let running: Promise<void> | undefined;
  const searches = new Map<string, { at: number; cards: McpCard[] }>();
  const latest = new Map<string, { at: number; entry: Entry | null | undefined }>();
  const get = (url: string | URL) => fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });

  function waitFrom(res: Response) {
    const retry = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (res.status === 429 || res.headers.get("x-ratelimit-remaining") === "0")
      notBefore = Math.max(notBefore, retry ? Date.now() + retry * 1000 : reset ? reset * 1000 : Date.now() + hour);
  }

  async function save(entry: Entry) {
    if (!valid(entry)) return;
    // An entry's README is most of its size, and nothing shows it.
    const repo = github(entry);
    if (repo) delete repo.readme;
    await sql`insert into registry_entries (source, name, version, entry) values (${mirrorUrl}, ${entry.server.name}, ${entry.server.version}, ${sql.json(entry as never)})
      on conflict (source, name) do update set version = excluded.version, entry = excluded.entry, updated_at = now()`;
  }

  // Each copy of fxbot's list is whole: what it lacks is gone.
  async function replaceList(servers: Entry[]) {
    await sql.begin(async (tx) => {
      await tx`delete from registry_entries where source = ${ours}`;
      for (const entry of servers.filter(valid))
        await tx`insert into registry_entries (source, name, version, entry) values (${ours}, ${entry.server.name}, ${entry.server.version}, ${sql.json(entry as never)})
          on conflict (source, name) do nothing`;
    });
  }
  // The shipped copy until the published one has been read once; then the published one, kept when a fetch fails.
  async function syncList() {
    const [state] = await sql<{ syncedAt: Date | null }[]>`select synced_at from registry_syncs where source = ${ours}`;
    if (!fxbotUrl || !state?.syncedAt) await replaceList(fxbotList);
    if (!fxbotUrl) return;
    try {
      const res = await get(fxbotUrl);
      if (!res.ok) throw new Error(`fxbot's list answered HTTP ${res.status}.`);
      const page = (await res.json()) as { servers?: unknown };
      if (!Array.isArray(page.servers)) throw new Error("fxbot's list has no servers.");
      await replaceList(page.servers);
      await sql`insert into registry_syncs (source, synced_at, error) values (${ours}, now(), null) on conflict (source) do update set synced_at = excluded.synced_at, error = null`;
    } catch (error) {
      const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "fxbot's list didn't answer.";
      await sql`insert into registry_syncs (source, error) values (${ours}, ${message}) on conflict (source) do update set error = excluded.error`;
    }
  }
  // fxbot's list as stored, or as shipped before its first sync.
  async function listed() {
    const rows = await sql<{ entry: Entry }[]>`select entry from registry_entries where source = ${ours}`;
    return new Map((rows.length ? rows.map((r) => r.entry) : fxbotList.filter(valid)).map((e) => [e.server.name, e]));
  }

  // The published skills list replaces the one in memory; a failed fetch keeps it.
  async function syncSkills() {
    if (!fxbotSkillsUrl) return;
    const res = await get(fxbotSkillsUrl).catch(() => null);
    const page = res?.ok ? ((await res.json().catch(() => null)) as { skills?: unknown } | null) : null;
    if (Array.isArray(page?.skills)) ourSkills = (page.skills as SkillEntry[]).filter(skillEntry);
    else console.error(`fxbot's skills list didn't answer${res ? ` (HTTP ${res.status})` : ""}; keeping the one it had.`);
  }

  async function syncMirror() {
    if (Date.now() < notBefore || !(await mirrorWanted())) return;
    const [state] = await sql<{ syncedAt: Date | null; startedAt: Date | null }[]>`select synced_at, started_at from registry_syncs where source = ${mirrorUrl}`;
    const started = new Date();
    let cursor = "";
    try {
      do {
        const url = new URL(`${mirrorUrl}/v0.1/servers`);
        url.searchParams.set("version", "latest");
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("cursor", cursor);
        if (state?.syncedAt && state.startedAt) url.searchParams.set("updated_since", state.startedAt.toISOString());
        const res = await get(url);
        waitFrom(res);
        if (!res.ok) throw new Error(res.status === 429 ? "The registry asked fxbot to wait." : `The registry answered HTTP ${res.status}.`);
        const page = (await res.json()) as { servers?: Entry[]; metadata?: { nextCursor?: string } };
        for (const entry of page.servers ?? []) await save(entry);
        cursor = page.metadata?.nextCursor ?? "";
        if (cursor && Date.now() < notBefore) throw new Error("The registry's rate limit ran out partway; the rest comes next time.");
      } while (cursor);
      await sql`insert into registry_syncs (source, synced_at, started_at, error) values (${mirrorUrl}, now(), ${started}, null)
        on conflict (source) do update set synced_at = excluded.synced_at, started_at = excluded.started_at, error = null`;
    } catch (error) {
      const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "The registry didn't answer.";
      await sql`insert into registry_syncs (source, error) values (${mirrorUrl}, ${message}) on conflict (source) do update set error = excluded.error`;
    }
  }
  // The published plugins list replaces the one in memory; a failed fetch keeps it.
  async function syncPlugins() {
    if (!fxbotPluginsUrl) return;
    const res = await get(fxbotPluginsUrl).catch(() => null);
    const page = res?.ok ? ((await res.json().catch(() => null)) as { plugins?: unknown } | null) : null;
    if (Array.isArray(page?.plugins)) ourPlugins = (page.plugins as PluginEntry[]).filter(pluginEntry);
    else console.error(`fxbot's plugins list didn't answer${res ? ` (HTTP ${res.status})` : ""}; keeping the one it had.`);
  }
  const sync = () => (running ??= Promise.all([syncList(), syncSkills(), syncPlugins(), syncMirror()]).then(() => {}).finally(() => (running = undefined)));

  // The official registry's own search: a name's substring, at least 3 characters.
  async function everythingFor(text: string) {
    const key = text.toLowerCase();
    const hit = searches.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.cards;
    const url = new URL(`${everythingUrl}/v0.1/servers`);
    url.searchParams.set("search", text);
    url.searchParams.set("version", "latest");
    url.searchParams.set("limit", "30");
    const res = await get(url).catch(() => null);
    if (!res?.ok) throw new Error(res ? `The official registry answered HTTP ${res.status}.` : "The official registry didn't answer.");
    const cards = (((await res.json()) as { servers?: Entry[] }).servers ?? []).filter(valid).map((e) => cardOf(e, "official")).filter((c) => c.status !== "deleted");
    searches.set(key, { at: Date.now(), cards });
    return cards;
  }

  // skills.sh's own search, cached for 5 minutes. Results that don't name a GitHub repository's skill are left out.
  async function skillsFor(text: string) {
    const key = text.toLowerCase();
    const hit = skillSearches.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.entries;
    const url = new URL(`${skillsUrl}/api/search`);
    url.searchParams.set("q", text);
    url.searchParams.set("limit", "20");
    const res = await get(url).catch(() => null);
    if (!res?.ok) throw new Error(res ? `skills.sh answered HTTP ${res.status}.` : "skills.sh didn't answer.");
    const entries = (((await res.json()) as { skills?: SkillEntry[] }).skills ?? []).filter(skillEntry);
    skillSearches.set(key, { at: Date.now(), entries });
    return entries;
  }

  // An official entry's newest version, for a plugin from it, asked at most hourly. Null when the registry has none.
  async function officialLatest(name: string) {
    const hit = latest.get(name);
    if (hit && Date.now() - hit.at < hour) return hit.entry;
    const res = await get(`${everythingUrl}/v0.1/servers/${encodeURIComponent(name)}/versions/latest`).catch(() => null);
    const entry = res?.status === 404 ? null : res?.ok ? ((await res.json()) as Entry) : undefined;
    latest.set(name, { at: Date.now(), entry });
    return entry;
  }

  // An entry for its plugin page, read when the page opens and again at Add or Update: fxbot's list as stored, or the
  // registry's own answer. Null when there is no such entry. A registry's latest is kept too, so that a plugin
  // updated between syncs isn't marked with an older version.
  async function lookup(name: string, from: RegistryFrom, version = "latest"): Promise<Entry | null> {
    if (from === "fxbot") {
      const entry = (await listed()).get(name);
      return entry && (version === "latest" || version === entry.server.version) ? entry : null;
    }
    const res = await get(`${from === "official" ? everythingUrl : mirrorUrl}/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`The registry answered HTTP ${res.status}.`);
    const entry = (await res.json()) as Entry;
    if (!valid(entry)) return null;
    if (version === "latest") {
      if (from === "official") latest.set(name, { at: Date.now(), entry });
      else await save(entry);
    }
    return entry;
  }

  const timer = setInterval(() => void sync(), hour);
  timer.unref();

  return {
    sync,
    lookup,
    // fxbot's list and the mirror, one card per server, fxbot's when both have it. Ranked by the server's own name,
    // then its title, then its namespace, then its description, and within each, fxbot's first, then by stars. No
    // words lists fxbot's, then the most-starred.
    // `vetted` keeps to fxbot's list, and asks no registry.
    async search(q: unknown, { kind, everything, vetted = false }: { kind?: unknown; everything?: boolean; vetted?: boolean } = {}): Promise<McpSearch> {
      const [state] = await sql<{ syncedAt: Date | null; error: string | null }[]>`select synced_at, error from registry_syncs where source = ${mirrorUrl}`;
      const result: McpSearch = { cards: [], syncedAt: state?.syncedAt?.toISOString() ?? null, ...(state?.error ? { error: state.error } : {}) };
      if (kind !== undefined && kind !== "" && kind !== "mcp") return result;
      const text = typeof q === "string" ? q.trim().slice(0, 100) : "";
      const like = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await sql<{ entry: Entry; source: string }[]>`
        select entry, source from (
          select distinct on (name) * from (
            select entry, source, entry->'server'->>'name' as name, regexp_replace(entry->'server'->>'name', '^.*/', '') as own,
              coalesce(entry->'server'->>'title', entry->'server'->'_meta'->'io.modelcontextprotocol.registry/publisher-provided'->'github'->>'displayName', '') as title,
              coalesce(entry->'server'->>'description', '') as description,
              (entry->'server'->'_meta'->'io.modelcontextprotocol.registry/publisher-provided'->'github'->>'stargazerCount')::int as stars
            from registry_entries
            where source in ${sql(vetted ? [ours] : [mirrorUrl, ours])} and coalesce(entry->'_meta'->'io.modelcontextprotocol.registry/official'->>'status', 'active') <> 'deleted'
          ) a
          order by name, source = ${ours} desc
        ) e
        where ${text} = '' or name ilike ${like} or title ilike ${like} or description ilike ${like}
        order by case when ${text} = '' or own ilike ${like} then 0 when title ilike ${like} then 1 when name ilike ${like} then 2 else 3 end, source = ${ours} desc, stars desc nulls last, name
        limit 20`;
      result.cards = rows.map((r) => cardOf(r.entry, r.source === ours ? "fxbot" : "github"));
      if (everything && !vetted && text.length >= 3) {
        try {
          const have = new Set(result.cards.map((c) => c.name));
          result.cards.push(...(await everythingFor(text)).filter((c) => !have.has(c.name)));
        } catch (error) {
          result.everythingError = (error as Error).message;
        }
      }
      return result;
    },
    // What its source says now about each plugin from one, and a mark when there is a newer version, or the entry is
    // deprecated or gone. Nothing changes by itself.
    async decorate<T extends { source?: { registry: string; version: string; from?: RegistryFrom } }>(plugins: T[]) {
      const names = plugins.flatMap((a) => (a.source && (a.source.from ?? "github") === "github" ? [a.source.registry] : []));
      const rows = names.length ? await sql<{ name: string; entry: Entry }[]>`select name, entry from registry_entries where source = ${mirrorUrl} and name in ${sql(names)}` : [];
      const [state] = await sql<{ syncedAt: Date | null }[]>`select synced_at from registry_syncs where source = ${mirrorUrl}`;
      const mirrored = new Map(rows.map((r) => [r.name, r.entry]));
      const ourList = plugins.some((a) => a.source?.from === "fxbot") ? await listed() : new Map<string, Entry>();
      return Promise.all(
        plugins.map(async (addon): Promise<T & { info?: RegistryInfo; mark?: PluginMark }> => {
          const { source } = addon;
          if (!source) return addon;
          const from = source.from ?? "github";
          // Unknown until the mirror has synced, or the official registry answers.
          const entry =
            from === "fxbot" ? (ourList.get(source.registry) ?? null) : from === "official" ? await officialLatest(source.registry) : (mirrored.get(source.registry) ?? (state?.syncedAt ? null : undefined));
          if (entry === undefined) return addon;
          if (entry === null) return { ...addon, mark: { kind: "removed" } };
          const info = infoOf(entry, from);
          const mark: PluginMark | undefined =
            info.status === "deleted" ? { kind: "removed" } : info.status === "deprecated" ? { kind: "deprecated" } : info.version !== source.version ? { kind: "update", version: info.version } : undefined;
          return { ...addon, info, ...(mark ? { mark } : {}) };
        }),
      );
    },
    // fxbot's skills that match first, all of them with no words, then skills.sh's for 2 characters or more. A skill on
    // both shows once, as fxbot's.
    async searchSkills(q: unknown, vetted = false): Promise<SkillSearch> {
      const text = typeof q === "string" ? q.trim().slice(0, 100) : "";
      const words = text.toLowerCase();
      const ours = ourSkills.filter((e) => !words || [e.name, e.id, e.description ?? ""].some((t) => t.toLowerCase().includes(words)));
      const result: SkillSearch = { cards: ours.map((e) => skillCard(e, "fxbot")) };
      if (vetted || text.length < 2) return result;
      try {
        const have = new Set(ours.map((e) => e.id));
        result.cards.push(...(await skillsFor(text)).filter((e) => !have.has(e.id)).map((e) => skillCard(e, "skills.sh")));
      } catch (error) {
        result.error = (error as Error).message;
      }
      return result;
    },
    // A skill in fxbot's list, for its page.
    ourSkill: (id: string) => ourSkills.find((e) => e.id === id),
    // A package in fxbot's list, by its repository and folder.
    ourPackage: (ref: string) => ourPlugins.find((e) => `${e.repo}${e.path ? `/${e.path}` : ""}`.toLowerCase() === ref.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "").toLowerCase()),
    // The owner of the repository of the plugin by this name in fxbot's list, so a checkout's folder of it draws its icon.
    listedOwner: (name: string) => ourPlugins.find((e) => e.name === name)?.repo.split("/")[0],
    // fxbot's plugins that match, all of them with no words.
    searchPackages(q: unknown): PackageSearch {
      const words = typeof q === "string" ? q.trim().toLowerCase().slice(0, 100) : "";
      const cards = ourPlugins
        .filter((e) => !words || [e.name, e.repo, e.description].some((t) => t.toLowerCase().includes(words)))
        .map((e): PackageCard => ({ kind: "package", name: e.name.slice(0, 64), iconKey: `${e.repo.split("/")[0]}/${e.name}`, description: e.description.slice(0, 1024), ref: `${e.repo}${e.path ? `/${e.path}` : ""}`, from: "fxbot" }));
      return { cards };
    },
    close: () => clearInterval(timer),
  };
}
