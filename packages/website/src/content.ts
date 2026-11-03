import changelog from "../../../CHANGELOG.md?raw";
import readme from "../../../README.md?raw";
import { markdown } from "./markdown.ts";

// Two sets of pages, each in Diátaxis's four kinds (https://diataxis.fr), in the order its sidebar lists them: the
// docs, for running fxbot, and the SDK's, for building on it. Each page is one kind only. A page is <root>/<slug>.md,
// or <root>/index.md for the set's own home, except the changelog, which is the repository's own CHANGELOG.md.
type Group = { title: string; about: string; pages: { slug: string; label: string }[] };

export const groups: Group[] = [
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

export const sdkGroups: Group[] = [
  {
    title: "Tutorials",
    about: "A first app on the SDK, from an empty folder to a chat with your bot.",
    pages: [{ slug: "tutorials/terminal-chat", label: "Build a terminal chat" }],
  },
  {
    title: "How-to guides",
    about: "Steps for one task in your own app.",
    pages: [
      { slug: "how-to/set-up", label: "Use the SDK in a project" },
      { slug: "how-to/stream-replies", label: "Stream replies" },
      { slug: "how-to/providers", label: "Connect providers" },
      { slug: "how-to/tools", label: "Give bots tools" },
      { slug: "how-to/memories", label: "Work with memories" },
      { slug: "how-to/web-page", label: "Build a page on the client" },
    ],
  },
  {
    title: "Reference",
    about: "The SDK's calls, options, and types, and the server's HTTP API.",
    pages: [
      { slug: "reference/create-fxbot", label: "createFxbot" },
      { slug: "reference/server-api", label: "The fxbot object" },
      { slug: "reference/client", label: "The client" },
      { slug: "reference/http-api", label: "HTTP API" },
    ],
  },
  {
    title: "Explanation",
    about: "How the SDK works under an app, and why.",
    pages: [{ slug: "explanation/how-it-works", label: "How the SDK works" }],
  },
];

const docFiles = import.meta.glob<string>("../docs/**/*.md", { query: "?raw", import: "default", eager: true });
const sdkFiles = import.meta.glob<string>("../sdk/**/*.md", { query: "?raw", import: "default", eager: true });

// The environment table, taken from the README so the two never differ. The Configuration page marks its place.
const variablesMark = "<!-- the variables table from README.md -->";
const lines = readme.split("\n");
const start = lines.findIndex((line) => line.startsWith("| Variable |"));
const end = lines.findIndex((line, i) => i > start && !line.startsWith("|"));
if (start < 0) throw new Error("README.md has no | Variable | table for the Configuration page");
const variables = lines.slice(start, end < 0 ? undefined : end).join("\n");

// One set's pages, with their addresses and rendered text. Every Markdown file in the set must be in its sidebar.
function collection(root: "docs" | "sdk", groups: Group[], files: Record<string, string>) {
  const file = (slug: string) => `../${root}/${slug || "index"}.md`;
  const listed = [{ slug: "", label: "Overview" }, ...groups.flatMap((group) => group.pages)];
  for (const name of Object.keys(files)) if (!listed.some((page) => file(page.slug) === name)) throw new Error(`${name} is not in the ${root} sidebar (src/content.ts)`);
  const source = (slug: string) => {
    if (root === "docs" && slug === changelogSlug) return changelog;
    const text = files[file(slug)];
    if (text === undefined) throw new Error(`The ${root} sidebar lists ${file(slug)}, which does not exist`);
    return text.replace(variablesMark, () => variables);
  };
  return listed.map((page) => ({ ...page, root, path: page.slug ? `${root}/${page.slug}/` : `${root}/`, ...markdown(source(page.slug)) }));
}

export const docs = collection("docs", groups, docFiles);
export const sdk = collection("sdk", sdkGroups, sdkFiles);
export type Doc = (typeof docs)[number];

export const changelogPath = `docs/${changelogSlug}/`;

// The newest release in the changelog, for the home page.
const [, version = "", date = ""] = changelog.match(/^## (\d+\.\d+\.\d+\S*) \((\d{4}-\d{2}-\d{2})\)/m) ?? [];
export const latest = { version, date };
