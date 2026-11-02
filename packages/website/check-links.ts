// Checks the built site in out/: every href and src in its pages, and every url() in its CSS, must name a file in out/,
// and every #fragment an id on that page. Links to other sites are left alone. `npm run build-site` runs it last.
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

const out = join(import.meta.dirname, "../../out");
const base = `/${process.env.FXBOT_SITE_BASE ?? ""}/`.replace(/\/+/g, "/");
const files = new Set((await readdir(out, { recursive: true })).map((name) => String(name).split("\\").join("/")));
const pages = new Map<string, string>();
for (const name of files) if (name.endsWith(".html")) pages.set(name, await readFile(join(out, name), "utf8"));
const ids = new Map([...pages].map(([name, html]) => [name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

// What is wrong with `url` in the file `from`, or nothing.
function problem(url: string, from: string) {
  if (/^[a-z][a-z+.-]*:/i.test(url) || url.startsWith("//")) return;
  const [path, hash] = url.replace(/&amp;/g, "&").split("#");
  let file = from;
  if (path) {
    const absolute = path.startsWith("/") ? path : posix.join("/", base, posix.dirname(from), path);
    if (!absolute.startsWith(base)) return `${url} is outside the site's base, ${base}`;
    file = decodeURIComponent(absolute.slice(base.length).split("?")[0]);
    if (file === "" || file.endsWith("/")) file += "index.html";
    if (!files.has(file)) return `${url}: out/${file} does not exist`;
  }
  if (hash && file.endsWith(".html") && !ids.get(file)?.has(decodeURIComponent(hash))) return `${url}: out/${file} has no id ${hash}`;
}

const problems: string[] = [];
let count = 0;
const check = (url: string, from: string) => {
  count++;
  const found = problem(url, from);
  if (found) problems.push(`${from}: ${found}`);
};
for (const [name, html] of pages) for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) check(url, name);
for (const name of files) {
  if (!name.endsWith(".css")) continue;
  const css = await readFile(join(out, name), "utf8");
  for (const [, url] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!url.startsWith("data:")) check(url, name);
}

if (problems.length) {
  console.error(`${problems.length} of ${count} links in out/ do not resolve:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`All ${count} links and assets in ${pages.size} pages and their CSS resolve.`);
