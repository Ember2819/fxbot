// Builds the site into out/ at the repository root, as static HTML for every page. FXBOT_SITE_BASE sets the path it
// is served under (vite.config.ts).
//   1. Vite builds index.html, the page template, with its CSS and script.
//   2. Vite builds src/render.tsx for Node, with the images the pages show.
//   3. Each page is rendered into the template.
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const root = import.meta.dirname;
const out = join(root, "../../out");
const server = join(root, "dist");

await build({ root, logLevel: "warn" });
await build({ root, logLevel: "warn", build: { ssr: "src/render.tsx", outDir: server, emptyOutDir: true, ssrEmitAssets: true } });

// The SSR build's own copies of the images the pages import, at the same hashed names.
for (const name of await readdir(join(server, "assets")).catch(() => [])) if (!name.endsWith(".js")) await cp(join(server, "assets", name), join(out, "assets", name));

const template = await readFile(join(out, "index.html"), "utf8");
if (!template.includes("<!--head-->") || !template.includes("<!--body-->")) throw new Error("index.html lost its <!--head--> and <!--body--> marks");
const { pages, searchFiles } = (await import(pathToFileURL(join(server, "render.js")).href)) as typeof import("./src/render.tsx");
const list = pages();
for (const page of list) {
  const file = join(out, page.file);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, template.replace("<!--head-->", () => page.head).replace("<!--body-->", () => page.body));
}
for (const [name, text] of Object.entries(searchFiles(list))) await writeFile(join(out, name), text);
await rm(server, { recursive: true });
// fxbot's own lists of MCP servers and skills, which each release also ships with, for installs that read the
// published copies (FXBOT_LISTS_URL). The SDK's files are the only copies to edit.
for (const list of ["mcp-registry.json", "skills-registry.json", "plugins-registry.json"]) await cp(join(root, "../sdk/src", list), join(out, list));
console.log(`The site is in ${out}`);
