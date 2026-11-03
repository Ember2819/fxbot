# One kind of plugin

fxbot had add-ons of three kinds, MCP servers, skills, and plugins, on three tabs. Now there is one kind of thing to install, a **plugin**, and one name for it everywhere. A plugin carries any mix of code, MCP servers, and skills, with at least one of them. By default, fxbot shows only the plugins it vets, tagged **fxbot**. A switch in Settings shows the public registries too.

Status: built on 2026-11-03, for 0.4.0, before it ships, so 0.4.0 has one concept. It changes the [plugins](plugins.md), [add-ons](addons.md), [MCP](mcp.md), and [skills](skills.md) phases' surface, not what they do.

## 0. Core or add-on

**Core.** The Plugins page and the kinds it can install are the seam every plugin uses.

## 1. The owner's decisions (2026-11-03)

1. **The name is "plugin".** It is the Agent Plugins format's name, `plugin.json`, and the name in Claude Code, Codex, and Cursor, where a plugin bundles skills and MCP servers.
2. **All the way down.** The app, the site, the README, the SDK's calls, the HTTP API, and the database's tables all say plugin. A breaking change for SDK users, in a release that says so.
3. **Vetted only, by default.** With the switch off, only fxbot's lists show, the public registries are never asked, and adding by address or repository is hidden and refused by the server. Turning it on shows GitHub's MCP registry, the official registry, skills.sh, and adding by address or repository.

## 2. Design

**One list of plugins.** Each installed plugin is one row, which says what it carries: "Code · 2 MCP servers · 1 skill". Underneath, a plugin is still one of three kinds of record, which the owner never sees as kinds:

| Kind | What it is | What it carries |
| --- | --- | --- |
| `mcp` | An MCP server, by address or from a registry | 1 MCP server |
| `skill` | A skill from fxbot's list or skills.sh | 1 skill |
| `package` | A folder with `plugin.json`, from GitHub or `FXBOT_PLUGIN_DIRS` | Code, skills, and MCP servers, any mix |

- **A package's servers** are records of their own, as before, but they don't show as rows. They show in the package's settings, and they follow its switch and its choice of bots.
- **The MCP servers and skills already installed** show as plugins that carry one thing. No data moves.

**Browse** replaces the Skills, MCP, and Plugins tabs. It lists fxbot's lists as one, each card saying what the plugin carries. With unvetted plugins on, it also searches GitHub's MCP registry (and the official one with **Search everything**) and skills.sh, and offers **Add by address** and **From GitHub**.

**The switch** is `unvetted` in Settings, false by default. While it's false:
- search answers only fxbot's cards, and asks no registry
- preview and add take only refs in fxbot's lists
- the mirror of GitHub's registry syncs only while an installed server came from it, so its update marks keep working

**Names.**

| Before | After |
| --- | --- |
| The **Add-ons** page, `/addons` | **Plugins**, `/plugins` (`/addons` still opens it) |
| `fxbot.addons.*`, `client.addons.*` | `fxbot.plugins.*`, `client.plugins.*`; the page list is `plugins.pages()` |
| `/api/addons/…`, `/api/profiles/:id/addons/:id` | `/api/plugins/…`, `/api/profiles/:id/plugins/:id` |
| Tables `addons`, `addon_secrets`, `profile_addons`, `skills.addon_id` | `plugins`, `plugin_secrets`, `profile_plugins`, `skills.plugin_id` (migration `0007_one_kind_of_plugin`) |
| Kind `plugin` | `package` |
| `Addon`, `McpAddon`, `SkillAddon`, `PluginAddon` | `Plugin`, `McpPlugin`, `SkillPlugin`, `PackagePlugin` |
| `AddonRef`, and `{ plugin }` for a package | `PluginRef`, and `RepoRef`, `{ repo }` |
| `AddonPreview`, `PluginPreview`, `AddonCard`, `PluginCard`, `AddonSearch`, `PluginSearch` | `McpPreview`, `PackagePreview`, `McpCard`, `PackageCard`, `McpSearch`, `PackageSearch` |
| `AddonSecrets`, `AddonMark`, `AddonInfo`, `AddonFrom`, `AddonTool` | `PluginSecrets`, `PluginMark`, `RegistryInfo`, `RegistryFrom`, `McpTool` |

A package's own routes stay at `/api/plugins/<name>/`. Management takes the rest of `/api/plugins/`: the list, `search`, `preview`, `pages`, and a plugin's 12-character id. So a package's name can't be 12 hex characters or one of those words, nor `addons`, `plugins`, `settings`, `library`, or `profiles`, which are the app's own paths.

## 3. Checklist

- [x] **M1. Names.** The SDK, the client, the server's routes, migration `0007`, and the app compile and work under the new names. The plugin checks from the plugins phase pass again.
- [x] **M2. Vetted only.** With the switch off: search shows only fxbot's cards, and no request reaches GitHub's registry, the official one, or skills.sh; preview and add refuse an address, a repository, and a public registry's entry, with 400. With it on, all of them work.
- [x] **M3. The page.** Plugins has Installed and Browse. Each row and card says what it carries. A package's servers show in its settings, not as rows, and follow its switch and bots. Settings has the switch. `/addons` opens Plugins. Phone width fits.
- [x] **M4. Docs.** The site, the README, AGENTS.md, and CONVENTIONS say plugin, the SDK's pages name the new calls and routes, and the changelog names every breaking change. `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass.

All checked on 2026-11-03 against a disposable database, the mock model, the mock GitHub, counting mocks of the public registries and skills.sh, and Chromium: the plugins phase's checks again under the new names (hooks, data, settings, routes, turns, installing, updates, chat rooms, and herdr), the vetted-only checks, and the page at desktop and phone widths. Migration `0007` also ran on a checkout's own database, whose MCP servers kept their sign-ins.
