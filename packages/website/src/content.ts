import changelog from "../../../CHANGELOG.md?raw";
import readme from "../../../README.md?raw";
import { markdown } from "./markdown.ts";

// The docs, in the order the sidebar lists them, in Diátaxis's four kinds (https://diataxis.fr): each page is one
// kind only. A page is docs/<slug>.md, or docs/index.md for the docs' own home, except the changelog, which is the
// repository's own CHANGELOG.md.
export const groups = [
  {
    title: "Tutorials",
    about: "A guided first run, from a fresh machine to a chat.",
    pages: [{ slug: "tutorials/first-fxbot", label: "Your first fxbot" }],
  },
  {
    title: "How-to guides",
    about: "Steps for one task, when you know what you want.",
    pages: [
      { slug: "how-to/add-a-provider", label: "Add a provider" },
      { slug: "how-to/add-a-skill", label: "Add a skill" },
      { slug: "how-to/add-an-mcp-server", label: "Add an MCP server" },
      { slug: "how-to/memory-search", label: "Choose memory search's vectors" },
      { slug: "how-to/reach-it", label: "Reach it from other devices" },
      { slug: "how-to/tailscale-service", label: "Serve it at its own name" },
      { slug: "how-to/update", label: "Update to a new release" },
      { slug: "how-to/go-back", label: "Go back to an earlier release" },
      { slug: "how-to/back-up", label: "Back up fxbot" },
      { slug: "how-to/checkout-beside-release", label: "Run a checkout beside a release" },
      { slug: "how-to/cut-a-release", label: "Cut a release" },
    ],
  },
  {
    title: "Reference",
    about: "Facts to look up: settings, paths, commands, providers, and changes.",
    pages: [
      { slug: "reference/configuration", label: "Configuration" },
      { slug: "reference/install-layout", label: "What setup.sh creates" },
      { slug: "reference/commands", label: "Commands" },
      { slug: "reference/providers", label: "Providers" },
      { slug: "reference/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Explanation",
    about: "How fxbot works, and why it works that way.",
    pages: [
      { slug: "explanation/core-and-add-ons", label: "Core and add-ons" },
      { slug: "explanation/security", label: "Security model" },
      { slug: "explanation/releases", label: "Releases and updates" },
      { slug: "explanation/architecture", label: "Architecture" },
      { slug: "explanation/bots-and-chats", label: "Bots, chats, memories, and the library" },
    ],
  },
];
const changelogSlug = "reference/changelog";

const files = import.meta.glob<string>("../docs/**/*.md", { query: "?raw", import: "default", eager: true });
const file = (slug: string) => `../docs/${slug || "index"}.md`;
const listed = [{ slug: "", label: "Overview" }, ...groups.flatMap((group) => group.pages)];
for (const name of Object.keys(files)) if (!listed.some((page) => file(page.slug) === name)) throw new Error(`${name} is not in the docs sidebar (src/content.ts)`);

// The environment table, taken from the README so the two never differ. The Configuration page marks its place.
const variablesMark = "<!-- the variables table from README.md -->";
const lines = readme.split("\n");
const start = lines.findIndex((line) => line.startsWith("| Variable |"));
const end = lines.findIndex((line, i) => i > start && !line.startsWith("|"));
if (start < 0) throw new Error("README.md has no | Variable | table for the Configuration page");
const variables = lines.slice(start, end < 0 ? undefined : end).join("\n");

function source(slug: string) {
  if (slug === changelogSlug) return changelog;
  const text = files[file(slug)];
  if (text === undefined) throw new Error(`The docs sidebar lists ${file(slug)}, which does not exist`);
  return text.replace(variablesMark, () => variables);
}

export const docs = listed.map((page) => ({ ...page, path: page.slug ? `docs/${page.slug}/` : "docs/", ...markdown(source(page.slug)) }));
export type Doc = (typeof docs)[number];

export const changelogPath = `docs/${changelogSlug}/`;

// The newest release in the changelog, for the home page.
const [, version = "", date = ""] = changelog.match(/^## (\d+\.\d+\.\d+\S*) \((\d{4}-\d{2}-\d{2})\)/m) ?? [];
export const latest = { version, date };
