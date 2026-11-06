// @ts-check
// fxbot.sh: the home page (src/pages/index.astro, in React) and two sets of documentation in Starlight, the docs under
// /docs/ and the SDK's under /sdk/ (src/content/docs/, one Diátaxis kind per page; src/sidebar.ts).
// `npm run build-site` builds it into out/ at the repository root and checks its links. FXBOT_SITE_BASE sets the path
// it is served under.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import react from "@astrojs/react";
import { satteri } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightPageActions from "starlight-page-actions";
import starlightSidebarTopics from "starlight-sidebar-topics";
import { topics } from "./src/sidebar.ts";

const site = "https://fxbot.sh";
const base = `/${process.env.FXBOT_SITE_BASE ?? ""}/`.replace(/\/+/g, "/");
const repo = "https://github.com/iammrduncan/fxbot";
const root = new URL("../../", import.meta.url);
const here = new URL("./", import.meta.url);

// What the site carries from the rest of the repository, written before each build into files that aren't committed:
// the changelog page, from CHANGELOG.md; fxbot's own lists of plugins, which installs read (FXBOT_LISTS_URL); the
// install script, at fxbot.sh/setup.sh (the site deploys from main, so it's main's); the icon; and robots.txt.
function repositoryFiles() {
  /** @param {string} path @param {string} text */
  const write = (path, text) => writeFileSync(new URL(path, here), text);
  const setup = () => {
    const changelog = readFileSync(new URL("CHANGELOG.md", root), "utf8").replace(/^# Changelog\n+/, "");
    const about = changelog.split("\n\n")[0].replace(/\s+/g, " ");
    write(
      "src/content/docs/docs/reference/changelog.md",
      `---\ntitle: Changelog\ndescription: ${JSON.stringify(about)}\n---\n\n${changelog.trim()}\n\nEach release is also on [GitHub Releases](${repo}/releases), with a short version of its section here.\n`,
    );
    mkdirSync(new URL("public", here), { recursive: true });
    for (const list of ["mcp-registry.json", "skills-registry.json", "plugins-registry.json", "plugin-breaks.json"]) copyFileSync(new URL(`packages/sdk/src/${list}`, root), new URL(`public/${list}`, here));
    copyFileSync(new URL("setup.sh", root), new URL("public/setup.sh", here));
    copyFileSync(new URL("packages/ui/public/icon-192.png", root), new URL("public/icon-192.png", here));
    write("public/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${site}${base}sitemap-index.xml\n`);
  };
  return { name: "fxbot-repository-files", hooks: { "astro:config:setup": setup } };
}

// A page's links: /docs/x/ is a page of this site, under its base, and so is a full address on it, as the changelog
// writes them; #x a heading; and any other relative link a file in the repository, such as CONVENTIONS.md, which
// opens on GitHub.
/** @param {string} url */
function linkTo(url) {
  if (url.startsWith(`${site}/`)) url = url.slice(site.length);
  if (url.startsWith("/") && !url.startsWith("//")) return base + url.slice(1);
  if (url.startsWith("#") || /^[a-z][a-z+.-]*:/i.test(url)) return url;
  return `${repo}/blob/main/${url.replace(/^\.\//, "")}`;
}
/** @type {import("satteri").MdastPluginDefinition} */
const links = {
  name: "fxbot-links",
  link: (node, ctx) => ctx.setProperty(node, "url", linkTo(node.url)),
  definition: (node, ctx) => ctx.setProperty(node, "url", linkTo(node.url)),
};

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  outDir: "../../out",
  devToolbar: { enabled: false },
  markdown: { processor: satteri({ mdastPlugins: [links] }) },
  // Loopback only; `tailscale serve` can show it on the tailnet, whose names end in .ts.net.
  server: { host: "127.0.0.1", port: 4173 },
  vite: { plugins: [tailwindcss()], preview: { allowedHosts: [".ts.net"] }, server: { allowedHosts: [".ts.net"] } },
  integrations: [
    repositoryFiles(),
    react(),
    starlight({
      title: "fxbot",
      description: "fxbot is your bot, built and configured how you want it: a lean, local-first core that works with local models and grows with the plugins you pick.",
      favicon: "/icon-192.png",
      head: [
        { tag: "meta", attrs: { property: "og:image", content: `${site}${base}card.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" } },
        { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0a0a0a" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: `${base}icon-192.png` } },
        // Fathom: cookieless page views, counted on fxbot.sh only (not on pages.dev or a local preview).
        { tag: "script", attrs: { src: "https://cdn.usefathom.com/script.js", "data-site": "WZDAIRJP", "data-included-domains": "fxbot.sh", defer: true } },
      ],
      social: [
        { icon: "discord", label: "Join the Hackers in the Loop community on Discord", href: "https://discord.gg/3Qs2uejUf9" },
        { icon: "github", label: "fxbot on GitHub", href: repo },
      ],
      editLink: { baseUrl: `${repo}/edit/main/packages/website/` },
      customCss: ["@fontsource-variable/geist", "./src/styles/docs.css"],
      components: { SiteTitle: "./src/components/SiteTitle.astro", PageTitle: "./src/components/PageTitle.astro" },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        styleOverrides: { borderRadius: "0.75rem", borderColor: "var(--sl-color-hairline)", frames: { shadowColor: "transparent" } },
      },
      plugins: [
        starlightSidebarTopics(
          topics.map((topic) => ({
            label: topic.label,
            link: `/${topic.id}/`,
            icon: topic.id === "docs" ? "open-book" : "laptop",
            items: [
              { label: "Overview", slug: topic.id },
              ...topic.groups.map((group) => ({ label: group.title, items: group.pages.map((page) => ({ label: page.label, slug: `${topic.id}/${page.slug}` })) })),
            ],
          })).concat([{ label: "Plugins", link: "/plugins/", icon: "puzzle" }]),
        ),
        // Copy page as Markdown, and open it in ChatGPT or Claude. components/PageTitle.astro adds Copy all docs.
        starlightPageActions({ actions: { chatgpt: true, claude: true, markdown: true } }),
        starlightLlmsTxt({
          projectName: "fxbot",
          description: "fxbot is your bot, built and configured how you want it: a lean, local-first core, on libfx, that works with local models and grows with the plugins you pick.",
          details: `To set fxbot up on a machine, follow [agent-setup.txt](${site}${base}agent-setup.txt).`,
          customSets: [
            { label: "Docs", paths: ["docs/**"], description: "running fxbot: install, providers, plugins, updates, and how it works" },
            { label: "SDK", paths: ["sdk/**"], description: "building your own app or plugin on @fxbot/sdk" },
          ],
        }),
        // The home page and the plugin directory are Astro pages outside the docs. check-links.ts checks their links.
        starlightLinksValidator({ errorOnLocalLinks: false, exclude: [base, `${base}plugins/`, `${base}plugins/**`] }),
      ],
    }),
  ],
});
