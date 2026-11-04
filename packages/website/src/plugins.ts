import { Marked } from "marked";
import pluginsList from "../../sdk/src/plugins-registry.json?raw";
import serversList from "../../sdk/src/mcp-registry.json?raw";
import skillsList from "../../sdk/src/skills-registry.json?raw";
import { repo } from "./site.ts";

// fxbot's vetted plugins, as the directory at /plugins/ shows them: the packages, servers, and skills on its three
// lists, which installs read too, so the directory can't disagree with Browse. A package in this repository also
// shows what its folder holds: its code, skills, settings, and README.
export type Listed = {
  slug: string; // its page, /plugins/<slug>/
  kind: "package" | "mcp" | "skill";
  name: string; // as Browse shows it: plugin.json's name, a server's title, or a skill's name
  creator: string; // the repository's owner, or the registry's namespace
  iconKey: string; // creator/name, as the app keys it (docs/_completed/phases/plugin-icons.md)
  description: string;
  carries: string; // as the app writes it: "Code · 3 skills", "MCP server", or "Skill"
  source: string; // its folder or repository on GitHub
  code?: string[];
  skills?: { name: string; description: string }[];
  servers?: string[];
  settings?: { name: string; description: string }[];
  server?: { url: string; key?: string; website?: string };
  skillsSh?: string;
  readme?: string; // HTML
};

type PluginEntry = { name: string; description: string; repo: string; path?: string };
type ServerEntry = { server: { name: string; title?: string; description: string; websiteUrl?: string; remotes?: { url: string; headers?: { description?: string; isSecret?: boolean }[] }[] } };
type SkillEntry = { id: string; source: string; skillId: string; name: string; description?: string };
type Manifest = { name: string; extensions?: { "sh.fxbot"?: { server?: string; page?: string; settings?: { name: string; description: string }[] } } };

// This repository's own plugins' folders, read at build time.
const files = import.meta.glob<string>(["../../../plugins/*/plugin.json", "../../../plugins/*/mcp.json", "../../../plugins/*/README.md", "../../../plugins/*/skills/*/SKILL.md"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const inFolder = (folder: string, path: string) => files[`../../../${folder}/${path}`];
const ownRepo = repo.replace("https://github.com/", "");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
// A README under the page's own README heading: its title dropped, and each heading a level down.
const markdown = new Marked({ walkTokens: (token) => void (token.type === "heading" && (token.depth = Math.min(6, token.depth + 1))) });
const frontMatter = (text: string, field: string) => text.match(new RegExp(`^---[\\s\\S]*?^${field}:\\s*(.+)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";

function packageOf(entry: PluginEntry): Listed {
  const creator = entry.repo.split("/")[0];
  const base = { slug: entry.name, kind: "package" as const, name: entry.name, creator, iconKey: `${creator}/${entry.name}`, description: entry.description, source: `https://github.com/${entry.repo}${entry.path ? `/tree/main/${entry.path}` : ""}` };
  const folder = entry.repo === ownRepo && entry.path ? entry.path : undefined;
  const manifest = folder && inFolder(folder, "plugin.json") ? (JSON.parse(inFolder(folder, "plugin.json")) as Manifest) : undefined;
  if (!folder || !manifest) return { ...base, carries: "Plugin" };
  const fx = manifest.extensions?.["sh.fxbot"] ?? {};
  const code = [fx.server, fx.page].filter((p): p is string => Boolean(p)).map((p) => p.replace(/^\.\//, ""));
  const skills = Object.entries(files)
    .filter(([path]) => path.startsWith(`../../../${folder}/skills/`))
    .map(([, text]) => ({ name: frontMatter(text, "name"), description: frontMatter(text, "description") }));
  const servers = Object.keys((JSON.parse(inFolder(folder, "mcp.json") ?? "{}") as { mcpServers?: object }).mcpServers ?? {});
  const readme = inFolder(folder, "README.md")?.replace(/^# .*\n+/, "");
  return {
    ...base,
    carries: [code.length && "Code", servers.length && plural(servers.length, "MCP server"), skills.length && plural(skills.length, "skill")].filter(Boolean).join(" · ") || "Plugin",
    code,
    skills,
    servers,
    settings: (fx.settings ?? []).map(({ name, description }) => ({ name, description })),
    ...(readme ? { readme: markdown.parse(readme) as string } : {}),
  };
}

function serverOf({ server }: ServerEntry): Listed {
  const [creator, slug] = server.name.split("/");
  const remote = server.remotes?.[0];
  const key = remote?.headers?.find((h) => h.isSecret)?.description;
  return {
    slug,
    kind: "mcp",
    name: server.title || slug,
    creator,
    iconKey: server.name,
    description: server.description,
    carries: "MCP server",
    source: server.websiteUrl ?? remote?.url ?? "",
    server: { url: remote?.url ?? "", ...(key ? { key } : {}), ...(server.websiteUrl ? { website: server.websiteUrl } : {}) },
  };
}

function skillOf(entry: SkillEntry): Listed {
  const creator = entry.source.split("/")[0];
  return {
    slug: entry.skillId,
    kind: "skill",
    name: entry.name,
    creator,
    iconKey: `${creator}/${entry.skillId}`,
    description: entry.description ?? "",
    carries: "Skill",
    source: `https://github.com/${entry.source}`,
    skillsSh: `https://skills.sh/${entry.id}`,
  };
}

// Packages, then servers, then skills, each in its list's order.
export const listed: Listed[] = [
  ...(JSON.parse(pluginsList) as { plugins: PluginEntry[] }).plugins.map(packageOf),
  ...(JSON.parse(serversList) as { servers: ServerEntry[] }).servers.map(serverOf),
  ...(JSON.parse(skillsList) as { skills: SkillEntry[] }).skills.map(skillOf),
];
const seen = new Set<string>();
for (const { slug } of listed) {
  if (seen.has(slug)) throw new Error(`Two plugins on fxbot's lists want /plugins/${slug}/.`);
  seen.add(slug);
}
