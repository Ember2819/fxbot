# The plugin directory on fxbot.sh

fxbot.sh gets a **Plugins** page: fxbot's vetted plugins, from its three lists, with a search box and a card each, drawn with its [icon](../_completed/phases/plugin-icons.md). Each plugin gets a page that says what it carries and how to add it. It's the place to look before installing, and the address to link to.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word; researched against the research directive's references. The owner's decisions:
- "a Plugins page on fxbot.sh: search fxbot's vetted plugins (from plugins-registry.json, plus its MCP and skill lists), a card per plugin with its generated icon, and a page each saying what it carries and how to add it"
- The owner chose this over making the Plugin API reference easier to search.
- It comes after [plugin icons](../_completed/phases/plugin-icons.md), whose site copy (its M4) it draws with.

## 0. Core or plugin

**Neither: the website.** It changes nothing in the app, the SDK, or the server.
- It reads only what the repository already holds: fxbot's three lists, and the folders of fxbot's own plugins.
- [Conventions](../../CONVENTIONS.md#core-or-plugin) put finding and vetting plugins in the core. The directory shows what the core already vets, and adds no way to install.

## 1. Research

### fxbot today

- **The lists:** `packages/sdk/src/plugins-registry.json` (2 packages: the computer and chat rooms), `mcp-registry.json` (2 servers: alphaXiv and Keiro), and `skills-registry.json` (3 skills: show-me, frontend-design, and grilling).
  - `repositoryFiles()` in `packages/website/astro.config.mjs:27` copies them into `public/` before each build, for installs to read (`:38`).
  - Installs read them from fxbot.sh every hour (`packages/sdk/src/index.ts:122`).
  - The app's **Browse** shows them as one list, "packages, then servers, then skills" (`packages/ui/src/plugins-page.tsx:104`).
- **The site** (`packages/website`) is Astro with Starlight:
  - The home page is React, rendered with no client code but `src/client.ts`: "The site's only script. Every page reads fine without it."
  - The docs' header is `src/components/SiteTitle.astro`, with Docs, SDK, and Changelog. The home page has its own header and footer in `src/layout.tsx`, with the same links. Below 420 px, its Changelog link hides.
  - On a phone, the docs' nav hides and "the menu's topics take the nav's place" (`src/styles/docs.css:77`). A page without a sidebar, such as the 404 page, has no menu.
  - `src/components/Variables.astro` already renders repository Markdown on a docs page, with `marked`, and `src/components/Kinds.astro` draws cards in `not-content`.
  - `npm run build-site` ends with `check-links.ts`, which fails on any `href` in `out/` that names no file.
- **Starlight custom pages,** read in `node_modules` (`@astrojs/starlight` 0.42.6):
  - `StarlightPage` (`dist/components/StarlightPage.astro`) gives a page outside the docs collection the docs' header, search, and theme.
  - Its edit link is off unless one is given (`dist/utils/starlight-page.js`).
  - Pagefind indexes it unless its frontmatter says `pagefind: false` (`dist/components/Page.astro:36`).
  - `template: "splash"` means no sidebar (`dist/utils/routing/data.js:39`), and then starlight-sidebar-topics looks for no topic (`starlight-sidebar-topics/dist/middleware.js`).
- **Two plugins of the site need a word for such a page:**
  - **starlight-page-actions** shows **Copy Markdown** and a **View as Markdown** link to `<page>.md` (`components/PageActions.astro:113`), which a custom page doesn't have, so `check-links.ts` would fail. It's hidden only by `pageActions: false` in the frontmatter (`:212`), which Starlight's schema drops unless `content.config.ts` extends it.
  - **starlight-links-validator** can't check links to custom pages: "Some invalid links point to custom pages which cannot be validated, see the `exclude` option" (`dist/index.js:83`). The site's config excludes only the home page (`astro.config.mjs:126`).
  - **starlight-llms-txt** builds `llms.txt` from the docs collection's paths (`astro.config.mjs`, `customSets`), so it doesn't see custom pages.
- **fxbot's own plugins** are folders in this repository, `plugins/computer` and `plugins/chat-rooms`. Each holds:
  - `plugin.json`, with its code files and settings
  - `README.md`, which starts with `# <name>` and links only to full addresses
  - `skills/<name>/SKILL.md`, with a one-line `name` and `description` each

### The references

- **eve** (`vercel/eve`): its docs site has an integrations directory, the closest prior art.
  - **The index** (`apps/docs/app/[lang]/integrations/page.tsx`): type tabs, a search box, and a grid of cards, with "Don't see your integration? Contribute to the official registry or host a third-party registry" below.
  - **The search** (`apps/docs/lib/integrations/gallery.ts`) matches `name`, `tagline`, and `keywords`, lowercased, in a client React component that also reports searches to analytics.
  - **A card** (`components/integration-card.tsx`): the logo on a bordered tile, the type, badges, the name, and a one-line tagline.
  - **A page** (`[slug]/page.tsx`): "All integrations" to go back, the logo, the name and type, the tagline, a link to its docs, then **Install**, **Quick start**, **Configure**, and **Related resources**.
  - **One source:** `packages/eve-catalog/src/index.ts` is "the single source of truth for *which* integrations exist", 103 of them, 102 of which the gallery shows, and "the docs gallery overlays presentation (logo, keywords, auth modes, hand-authored markdown)", keyed by slug.
  - **For agents and search:** each page is also Markdown (`lib/integrations/discovery.ts`), in its search index and sitemap.
- **Pi** (`earendil-works/pi`): a package gallery at pi.dev/packages, fetched today. Its source isn't in the repository.
  - "The `pi-package` keyword makes an npm package eligible for discovery" (`packages/coding-agent/docs/packages.md`). It lists 5,648 packages.
  - A card shows the name, description, author, monthly downloads, age, type, links to npm, the repository, and **report**, and `$ pi install npm:<name>` with **Copy**. No icons.
  - Search: "Filter packages by name, description, or author", a type filter, and a sort.
  - A package's page: its details, its install command, its Pi manifest, a "Security note" that "Pi packages can execute code and influence agent behavior", and its README.
- **Grok Bot** (docs only): **Connect apps** is an in-app catalog: "Browse or search for the app, then add it", then "Confirm the app appears under **Installed**". Packaged skills are found there too. The docs show no public directory.
- **OpenBot**: its plugins page holds a vendor catalogue, from Composio, inside the app (`app/src/lib/plugins/queries.ts`). No public directory.
- **agent-browser and agent-desktop** publish their skills on skills.sh, with a badge that links to `skills.sh/vercel-labs/agent-browser` (`README.md`).
- **No directory:** fx, fx0, durable-harness, OpenDuet, OpenDots, and openmuse.

### Directories beyond the list

- **skills.sh:** ranked rows, each with the skill's name, its repository, and its installs; a "Search skills..." box; and pages at `/<owner>/<repo>/<skill-name>`. No icons.
- **Obsidian's community directory:** cards with a name and a description; "Search plugins and themes..."; sorts by Popular, New, and Updated; and pages at `/plugins/<id>`.
- **Smithery:** pages at `/servers/<owner>/<name>`, and a two-letter tile for a server without an icon.
- **Raycast's store:** authors supply the icon, screenshots, and a `CHANGELOG.md`, which the store shows.

## 2. Key takeaways

1. **The lists are the one source** (eve's catalog). The directory reads the same files the build already copies for installs, at the same time, so it can't disagree with what **Browse** shows.
2. **Every directory has three parts:** a search over the name, the description, and who made it; a card; and a page that says how to install. eve, Pi, Obsidian, and skills.sh all do.
3. **Seven entries need a filter, not an app.** A dozen lines of script hide the cards that don't match, and the page reads fine without it. Starlight's search finds the pages as well. eve's gallery is React because it filters 102 entries by type and reports to analytics.
4. **Say what runs.** Pi's pages carry a note that packages "can execute code". fxbot's page says what runs inside fxbot, and that its page in fxbot shows the code to read before adding.
5. **How to add it is in the app.** The site can't know where your fxbot is, so it can't link into it. Pi and Raycast install from a page only through a command or a URL scheme of their own.
6. **One short address per entry,** as Obsidian, Pi, and eve do: `/plugins/<slug>/`. A duplicate slug fails the build.
7. **A custom page inside Starlight needs three switches:** the splash template, so no topic is looked for; `pageActions: false`, so there's no Markdown link to a file that doesn't exist; and the link validator's `exclude`, so docs can link to it.

## 3. Implementation

### The files

```text
packages/website/
├── astro.config.mjs                 Plugins as a link topic, for a phone's menu; the link validator skips /plugins/
├── src/plugins.ts                   new: fxbot's three lists and its own plugins' folders, as one list
├── src/pages/plugins/index.astro    new: the directory, with a search box and a card each
├── src/pages/plugins/[slug].astro   new: a page each
├── src/content.config.ts            `pageActions` survives in a page's frontmatter
├── src/styles/docs.css              the cards, the search box, and a page's head
├── src/components/SiteTitle.astro   Plugins in the docs' header
├── src/layout.tsx                   Plugins in the home page's header and footer
├── src/home.tsx                     the Plugins feature links to /plugins/
├── src/components/PluginIcon.astro  the drawing, from plugin icons
└── src/plugin-icon.ts               the generator, copied, from plugin icons
```

### The data: `src/plugins.ts`

```ts
// One of fxbot's vetted plugins, as its directory shows it.
export type Listed = {
  slug: string; // its page, /plugins/<slug>/
  kind: "package" | "mcp" | "skill";
  name: string; // as Browse shows it: plugin.json's name, a server's title, or a skill's name
  creator: string; // the repository's owner, or the registry's namespace
  iconKey: string; // creator/name, keyed as plugin icons says, which PluginIcon draws
  description: string;
  carries: string; // as the app writes it: "Code · 3 skills", "MCP server", or "Skill"
  source: string; // where it comes from: its folder or repository on GitHub
  code?: string[]; // a package's files that run inside fxbot: plugin.json's server and page
  skills?: { name: string; description: string }[]; // a package's skills, from their SKILL.md
  servers?: string[]; // a package's MCP servers, from its mcp.json
  settings?: { name: string; description: string }[]; // a package's settings, from plugin.json
  server?: { url: string; key?: string; website?: string }; // an MCP server's address, the key it asks for, and its site
  skillsSh?: string; // a skill's page on skills.sh: https://skills.sh/<owner>/<repo>/<skill>
  readme?: string; // a package in this repository: its README.md as HTML
};
export const listed: Listed[]; // packages, then servers, then skills, each in its list's order
```

How it's read, at build time:
- **The lists** as text, with Vite's `?raw`, as `Variables.astro` and `release.ts` read the README and the changelog:
  `import plugins from "../../sdk/src/plugins-registry.json?raw"`, and the same for the other two. Then `JSON.parse`.
- **fxbot's own folders**, for a package whose `repo` is fxbot's (`repo` in `src/site.ts`), at the entry's `path`:
  ```ts
  const files = import.meta.glob<string>(
    ["../../../plugins/*/plugin.json", "../../../plugins/*/mcp.json", "../../../plugins/*/README.md", "../../../plugins/*/skills/*/SKILL.md"],
    { query: "?raw", import: "default", eager: true },
  );
  ```
  - **Code:** `extensions["sh.fxbot"].server` and `.page`.
  - **Settings:** `extensions["sh.fxbot"].settings`, each name and description.
  - **Skills:** each `SKILL.md`'s `name:` and `description:` lines, between its `---` lines.
  - **MCP servers:** the names in `mcp.json`, when there is one. Neither plugin has one today.
  - **README:** `README.md`, its first `# ` line dropped, since the page has the title. Rendered by a `new Marked({ walkTokens })` that moves each heading down a level, under the page's own **README** heading.
- **A package elsewhere** has only what its list entry says: no code, skills, settings, or README. There's none today.
- **An MCP server:**
  - its creator and slug from the parts of `server.name`, before and after the `/`
  - its name from `title`
  - `url` from its first remote, and `key` from the description of a secret header, such as "Your Keiro API key, from keirolabs.cloud"
  - `website` from `websiteUrl`
- **A skill:**
  - its creator from `source`'s owner
  - its slug from `skillId`
  - `source` as `https://github.com/<source>`, and `skillsSh` as `https://skills.sh/<id>`
- **The slug** is a package's name, the part of a server's name after the `/`, or a skill's `skillId`. Two entries with one slug throw: `Two plugins on fxbot's lists want /plugins/<slug>/`.
- **`carries`:** "Code", "N MCP servers", and "N skills", joined by " · ", as the app's `carries()` (`packages/ui/src/plugins-page.tsx:26`). For a package elsewhere, "Plugin".

### `/plugins/`

A `StarlightPage` with `frontmatter={{ title: "Plugins", description, template: "splash", pageActions: false }}`:
- **A line** at the top: these are the plugins fxbot vets, which **Browse** in fxbot shows while unvetted plugins are off, and each costs nothing until it's added.
- **The search box,** an `<input type="search">` labelled "Search plugins". It's `hidden` until the script runs, so without the script every card shows and no dead box does.
- **The cards,** a `<ul class="fxbot-plugins not-content">`. Each `<li>` has `data-search`: the name, the creator, the description, and `carries`, lowercased. Its link to `/plugins/<slug>/` holds:
  - `<PluginIcon iconKey={iconKey} size={40} />`
  - the name
  - the creator and `carries`, as `iammrduncan · Code · 3 skills`
  - the description, at most two lines
- **"No plugin matches."** in a `role="status"` line, hidden while any card shows.
- **At the end:** links to Add a plugin (`/docs/how-to/add-a-plugin/`), for unvetted plugins, and to Write a plugin (`/sdk/how-to/write-a-plugin/`).
- **The script,** in the page's own `<script>`, about a dozen lines: on `input`, a card shows when every word typed is in its `data-search`.

### `/plugins/<slug>/`

`getStaticPaths()` returns one path per `listed` entry, with the entry as its props. A `StarlightPage` with `frontmatter={{ title: name, description, template: "splash", pageActions: false }}`, then:
- **"All plugins"**, a link back to `/plugins/`.
- **The head:** `<PluginIcon iconKey={iconKey} size={56} />`, the creator and `carries`, and the description.
- **What it carries:**
  - **A package:**
    - **Runs inside fxbot:** its code files, and a line that its page in fxbot shows the code to read before you add it.
    - **Skills:** each name, with its description.
    - **MCP servers:** each name.
    - **Settings:** each name, with its description.
  - **An MCP server:** its address; "Needs a key:", then its description, when it asks for one; and its website.
  - **A skill:** instructions bots read when a task calls for them, from `<source>`, with its skills.sh page.
- **How to add it,** three steps for every kind:
  1. In fxbot, open **Plugins**, the puzzle button at the bottom of the sidebar, and choose **Browse**. fxbot's picks list `<name>`.
  2. Choose it. Its page shows what it carries. For a package, read the code under **Runs inside fxbot**.
  3. Choose **Add**.
  - Then, for a server with a key: its page asks for the key before you add it.
  - For a package with settings: they're under the pencil button on its row.
  - A link to Add a plugin (`/docs/how-to/add-a-plugin/`).
- **Source:** a link to its folder or repository on GitHub.
- **README,** for a package in this repository, last.

### Into the directory

- **`SiteTitle.astro`:** **Plugins** between **SDK** and **Changelog**. `section` is `"plugins"` for paths under `${base}plugins/`, for `aria-current`.
- **`layout.tsx`:**
  - the header gets **Plugins** between **SDK** and **Changelog**. Below 420 px it hides, as **Changelog** does: at 375 px, a third link and the three buttons don't fit.
  - the footer gets **Plugins** after **SDK**.
- **`home.tsx`:** the **Plugins** feature's `link` becomes `/plugins/`.
- **`astro.config.mjs`:**
  - A link topic after the two, `{ label: "Plugins", link: "/plugins/", icon: "puzzle" }`, so a phone's menu has it. The SDK's topic icon becomes `laptop`, so the two don't share the puzzle, which is the app's Plugins button.
  - `starlightLinksValidator`'s `exclude` becomes `` [base, `${base}plugins/`, `${base}plugins/**`] ``, so docs can link to the directory. `check-links.ts` still checks those links in `out/`.
- **`content.config.ts`:** `docsSchema({ extend: z.object({ pageActions: z.boolean().optional() }) })`, with `z` from `astro/zod`.
- **`docs.css`:** `.fxbot-plugins`, one column, two from 40rem, with cards bordered like `.fxbot-kinds`; the search box; and the page's head.
- **Add a plugin** (`src/content/docs/docs/how-to/add-a-plugin.md`): under "fxbot's plugins", a line that each of fxbot's plugins has a page in the directory, `/plugins/`.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `src/plugins.ts` | The three lists and fxbot's folders, as `Listed[]` | about 70 |
| `src/pages/plugins/index.astro` | The cards, the box, and its script | about 45 |
| `src/pages/plugins/[slug].astro` | A page each | about 80 |
| `src/styles/docs.css` | Cards, the box, and a page's head | about 45 |
| `src/content.config.ts`, `astro.config.mjs` | `pageActions`; the topic; the validator | about 6 |
| `SiteTitle.astro`, `layout.tsx`, `home.tsx` | The links | about 9 |
| Add a plugin, `CHANGELOG.md` | A line each | about 3 |
| `src/plugin-icon.ts`, `src/components/PluginIcon.astro` | From [plugin icons](../_completed/phases/plugin-icons.md) | counted there |

Size: about 260 lines. Only `/plugins/` gains a script, about 0.5 KB. Other pages gain a header link, and the app, the SDK, and the server don't change.

### Not in this phase

- **Unvetted plugins:** GitHub's MCP registry, the official one, and skills.sh. The directory is fxbot's picks.
- **`llms.txt`:** starlight-llms-txt reads only the docs collection. For agents, the lists are already JSON at `/plugins-registry.json`, `/mcp-registry.json`, and `/skills-registry.json`.
- **A link into your own fxbot:** the site can't know its address.
- **Stars, installs, versions, screenshots,** and a social card per plugin.
- **A page per skill inside a package:** the package's page lists them.
- **More about a package outside this repository** than its list entry says, which would mean fetching GitHub at build time.

## 4. Checklist

The bound: about 260 lines, as above. Past 350, stop and say why. What's out of scope is under [Not in this phase](#not-in-this-phase). It needs [plugin icons](../_completed/phases/plugin-icons.md) through its M4, the site's copy. The site builds into `out/`; nothing here starts the app.

**M1. The data**
- [ ] `src/plugins.ts` gives 7 entries, in this order: computer, chat-rooms, alphaXiv, Keiro, show-me, frontend-design, grilling.
- [ ] Each entry's icon matches plugin icons' table: the computer's shape starts at `#eb728a`, chat rooms' at `#e59126`, and so on, in light mode.
- [ ] Two list entries with one slug stop `npm run build-site` with a message that names the slug. Try it with a copy of a list entry, then undo it.

**M2. `/plugins/`**
- [ ] `npm run build-site` writes `out/plugins/index.html`, and `ls out/plugins/*/index.html` lists 7 pages.
- [ ] In `out/plugins/index.html`, each card's `svg` has the table's `data-color` and `data-shape`.
- [ ] In a browser, typing `comp` leaves the computer, and `skill` leaves 5: the three skills, and the two packages that carry skills. `zzz` shows "No plugin matches."
- [ ] With scripts off, all 7 cards show, and the search box doesn't.
- [ ] At 375 px, the cards are one column, the box fits, and the page doesn't scroll sideways.

**M3. A page each**
- [ ] The computer's page shows:
  - its code, `fxbot/server.ts` and `fxbot/page.js`
  - its 3 skills, with their descriptions
  - its 5 settings
  - How to add it
  - its README, without a second `computer` title
- [ ] Keiro's page shows its address and "Needs a key: Your Keiro API key, from keirolabs.cloud".
- [ ] show-me's page links to `https://skills.sh/humanlayer/skills/show-me` and `https://github.com/humanlayer/skills`.
- [ ] `grep -c "copy-markdown" out/plugins/computer/index.html` prints 0, and no page under `out/plugins/` links to a `.md` file.
- [ ] Starlight's search, in a browser, finds chat rooms' page for "rooms".
- [ ] In light and dark, each page's head shows its icon, and the README's tables and code read as the docs' do.

**M4. Into the directory**
- [ ] The docs' header and the home page's header and footer link to **Plugins**. On `/plugins/` and its pages, the docs' header marks it current.
- [ ] At 375 px, the home page's header fits on one line. **Plugins** is in its footer, and in the docs' menu on a phone.
- [ ] The home page's Plugins feature links to `/plugins/`.
- [ ] Add a plugin links to the directory, and `npm run build-site` passes its link checks.

**M5. Docs and checks**
- [ ] `CHANGELOG.md` has, under `## Unreleased`, a line for the directory at fxbot.sh/plugins/.
- [ ] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [ ] `git diff --check` passes, and the new files have no trailing whitespace.
- [ ] One commit on `release/0.5.0`, not pushed.

**The human checks:**
- Read every page's How to add it against a real install: search each name in **Browse**, with unvetted plugins off, and it's there, as the page says.
- Look at `/plugins/` and two pages in light and dark, on a phone and a desktop.

## 5. Open questions

1. **Getting onto fxbot's list.** *Default:* the directory doesn't say how a plugin gets listed. It lists what fxbot vets, and links to Write a plugin. *The other way:* a line like eve's "Contribute to the official registry", if the owner takes suggestions, such as by an issue or a pull request to the list.
2. **The READMEs.** *Default:* a package's whole README, under **README**, including its Files table and how to build its page, which are for people changing it. *The other way:* only up to its first `##` heading, which is what it does and how to add it.
