# The plugin directory on fxbot.sh

fxbot.sh gets a **Plugins** page: every plugin on fxbot's own lists, with a search box, each as a card with its [icon](plugin-icons.md), and a page each that says what it carries and how to add it. It's the place to look before installing, and to link to.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word. The owner chose a directory of plugins, over making the Plugin API reference easier to search.

## Core or plugin

**The website.** It changes none of the app, the SDK, or the server, and reads only what the repository already holds.

## What's in it

What fxbot vets, which is what an install shows in **Browse** while unvetted plugins are off:
- `plugins-registry.json`: the packages, today the computer and chat rooms
- `mcp-registry.json`: the MCP servers, today alphaXiv and Keiro
- `skills-registry.json`: the skills, today three

The build already copies these lists into the site, at `/plugins-registry.json` and the others, for installs to read. The directory is built from the same files at the same time, so it can't disagree with what installs see.

## Pages

- **`/plugins/`**: the cards, in the lists' order, packages first. Each card has the icon, the name, the creator, what it carries (code, MCP servers, skills), and the description. A search box above them filters as you type, by name, creator, and description. It's a small React island; with 7 entries, all of the data is in the page. Starlight's own search finds the directory's pages as well.
- **`/plugins/<name>/`**, one per entry:
  - the icon, name, creator, and description
  - what it carries
  - for fxbot's own plugins, whose folders are in this repository, the plugin's `README.md`, below
  - for an MCP server, its address and whether it needs a key
  - for a skill, its repository
  - **How to add it**: open **Plugins** in fxbot, search its name in **Browse**, and **Add**; and a link to [Add a plugin](/docs/how-to/add-a-plugin/)
  - a link to its source
- **The site's header** (`src/components/SiteTitle.astro`) gets **Plugins** beside **Docs** and **SDK**, and the home page links to the directory where it now talks about plugins.

`llms.txt` lists the directory's pages, like the others.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/website/src/pages/plugins/index.astro` | The directory | about 40 |
| `packages/website/src/pages/plugins/[name].astro` | A page each | about 70 |
| `packages/website/src/plugins.ts` | Reads the three lists into one shape, with each local plugin's `README.md` and `plugin.json` | about 50 |
| `packages/website/src/plugin-search.tsx` | The search box and cards | about 60 |
| `packages/website/src/plugin-icon.tsx` | From [plugin icons](plugin-icons.md) | counted there |
| Header, home page, `astro.config.mjs` | The link; directory pages in `llms.txt` | about 10 |

Size: about 230 lines.

## Checks

- `npm run build-site` passes, links checked.
- `/plugins/` lists all 7 entries. Typing `comp` leaves the computer, and `skill` leaves the three skills.
- Each page's How to add it matches what an install shows: search its name in Browse, with unvetted plugins off, and it's there.
- A README's relative links open on GitHub, as the site's other repository links do.
- Phone width: the cards stack, and the search box fits.

## Questions

None open.
