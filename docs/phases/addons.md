# Add-ons

One place to find and add the things that work with fxbot. A search box over live registries lists MCP servers, skills, and plugins, and one Add puts them into fxbot.
- An [MCP server](../_completed/phases/mcp.md) gives bots tools from a remote service.
- A [skill](skills.md) is instructions that a bot reads when a task needs them.
- A [plugin](plugins.md) bundles MCP servers and skills. It can also run code on this machine: local MCP servers, tooling such as herdr, and hooks.

Every add-on has a page that lists what it installs, like Grok Bot's plugin page.

This page owns what they share:
- where results come from
- the add-on page and consent
- the add-on records
- how bots get add-ons

Status: planned, not built. Research and plan only. It lands after [MCP servers](../_completed/phases/mcp.md), which creates the add-on tables and the first Add-ons page, and adds search and the add-on page for MCP servers. [Skills](skills.md) and [plugins](plugins.md) then add their own sources and sections.

## 1. Research

These are read from docs, source, and read-only requests to public APIs, as of November 2026. Saved samples are in the research scratchpad.

**The official MCP Registry** (`registry.modelcontextprotocol.io`, [OpenAPI](https://registry.modelcontextprotocol.io/openapi.yaml))
- **API.** Service 1.8.7. `/v0.1` is the stable API, with additive changes only, and the schema version is `2025-12-11`. It still says "preview… data resets may occur."
- **Reads.** No auth, and CORS is `*`:
  - `GET /v0.1/servers?search&limit(≤100)&cursor&updated_since&version=latest`
  - `GET /v0.1/servers/{name}/versions/{version|latest}`
- **Search.** `search` matches a substring of the name, with at least 3 characters. Lists return a row per version, so ask for `version=latest`.
  - Checked here: `search=linear&version=latest` returns `app.linear/linear`, with two `streamable-http` remotes and a next cursor.
- **Fields that install a server:**
  - `name` (`namespace/name`), `title`, `description`, `version`, and `repository`
  - `remotes[]`: `type`, `url`, and `headers[]`, each with `isRequired` and `isSecret`
  - `packages[]`: npm, pypi, oci, nuget, mcpb, or cargo, with an exact `version`, a stdio `transport`, and `environmentVariables` with `isSecret`
  - a status of `active`, `deprecated`, or `deleted`
  - There are no OAuth fields, and no skills.
- **Scale.** About 54,000 latest servers, 31,600 of them remote-only, and about 70 records change an hour.
- **Who should read it.** The ecosystem design says "we expect clients pull from subregistries", which it expects to scrape it with ETL jobs. Its data is CC0, with no uptime or durability guarantees.
- **Trust.** It verifies namespaces: `io.github.<user>` through GitHub sign-in, and domains through DNS TXT or a well-known file. It does not check code, and "does not verify that you control the remote URL". Moderation is minimal, and a few publishers account for thousands of entries.

**Other MCP sources**
- **GitHub's MCP Registry** (`https://api.mcp.github.com/v0.1/servers`). A curated subregistry that serves the same API. GitHub picks the entries, and they sync from the official registry.
  - It holds 740 entries, 434 of them remote-only, and adds stars, license, topics, and the README.
  - Headers checked here: `cache-control: public, max-age=300`, `x-ratelimit-limit: 10`.
- **Smithery.** It answers without a key, and adds `verified`, use counts, and tool lists. Its remotes go through Smithery's own gateways.
- **Glama.** Needs a key, and its license requires a link for every record.
- **PulseMCP.** Partners only.
- **Docker's catalog.** A curated YAML of 316 entries (77 remote), with images pinned by digest and OAuth providers listed.

**Plugin marketplaces**
- **Grok Bot's catalog is Cursor's.** Grok Bot "inherits your team's Cursor connector policy. There is no separate Grok Bot connector list" ([teams](https://docs.x.ai/grok-bot/teams-and-enterprises)).
  - The owner's screenshots of Grok Bot's Twilio page show "Apps 1" (twilio-docs, a Connector), "Skills 57", then a table of Capabilities ("1 app, 57 skills"), Developer, Category, Website, and Availability.
  - Cursor's page for the same plugin shows "Skills 57", "MCP 1", "Created by Twilio", and "View Source", and its record pins a git ref ([marketplace](https://cursor.com/marketplace/twilio)).
- **Claude's marketplace format is the one most clients read.**
  - A marketplace is a git repo with `.claude-plugin/marketplace.json`: `{ name, owner, plugins: [{ name, source, description, version, author, category, tags, … }] }`.
  - An entry's `source` is a relative path, a git `url`, or a `git-subdir`, and the last two are pinned by `sha`. Claude Code also takes npm sources.
  - Codex reads `.claude-plugin/marketplace.json` too ([Codex](https://developers.openai.com/plugins/build/plugins)), and Grok Build "reads Claude Code marketplaces, plugins, skills" ([Grok Build](https://docs.x.ai/build/features/skills-plugins-marketplaces)). Cursor's own file is `.cursor-plugin/marketplace.json` ([Cursor](https://cursor.com/docs/plugins)).
- **Anthropic's official marketplace** (`anthropics/claude-plugins-official` at `a7ba5b9`, counted here).
  - It holds 315 plugins, all pinned: 53 by path in the marketplace's own repo, 163 by `url`, and 99 by `git-subdir`.
  - 192 hold only MCP servers and skills: 71 skills only, 29 MCP servers only, and 92 both. Their MCP servers are 102 remote and 44 local.
  - `twilio-developer-kit` is one of them, pinned to `twilio/ai` at `8aba46f`.

**Skill sources**
- **skills.sh** answers `GET /api/search?q=` with no key. Each result is `{ id, source, skillId, name, installs }`, where `source` is a GitHub `owner/repo`, and has no description ([skills](skills.md#1-research)).
- **Others.** ClawHub documents a public search API, which answered 500 when tried here. A draft RFC proposes `/.well-known/agent-skills/index.json` for websites. The MCP registries list no skills.

**How clients present catalogs**
- **VS Code.**
  - Its MCP gallery reads a v0.1 registry, with `limit`, `version=latest`, `search`, and `cursor`. It shows GitHub's stars and backs off on 429.
  - It asks "Trust and run MCP server {0}?", and asks again when the server's definition changes.
- **Claude Code plugins.**
  - A Discover tab searches every added marketplace.
  - Install shows a "Will install" list of the plugin's commands, agents, skills, hooks, and MCP and LSP servers.
- **eve.** `/add` searches a curated shadcn-format index at `https://eve.dev/r/registry.json`, of 115 items.
  - Each item carries its setup command, a version range, packages, and files.
  - Only items from eve's own registry may run setup commands. Its search tool fetches the whole index, caches it for 5 minutes, and ranks results locally. `eve registry search` also searches skills.sh.
- **No catalog.** opencode adds plugins and MCP servers by spec only (`opencode plugin add`, `opencode mcp add --url`). fx and libfx have none.

**libfx and fxbot today**
- libfx fixes an agent's tools when the agent is made. `agent.session()` varies only `context`, `model`, and `instructions`.
- fxbot runs one agent per provider ([provider logins](../_completed/phases/provider-logins.md)), and every agent gets the same tool list.

## 2. Key takeaways

1. **Mirror curated sources, and search them locally.**
   - The server mirrors GitHub's MCP registry and the plugin marketplaces into Postgres every hour. The MCP registry takes about 8 requests, so searching stays on the machine, inside GitHub's 10-request limit.
   - skills.sh has no listing to mirror, so skills are searched there, once per search.
   - Searching the whole official registry is an opt-in, "everything, unmoderated" mode.
2. **Install from what entries already say.**
   - A registry entry's `remotes` become an [MCP server](../_completed/phases/mcp.md).
   - Its `packages` mean a process on this machine, so they install as a [plugin](plugins.md).
   - A marketplace entry is a plugin, and a skills.sh result is a [skill](skills.md).
3. **Plugins come from marketplaces in Claude's format,** which Codex and Grok Build read too. The defaults:
   - Anthropic's official marketplace: 315 plugins, all pinned, and 192 of them only MCP servers and skills.
   - The project's own marketplace, for fxbot plugins such as herdr.
4. **Every add-on has a page that lists what it installs,** as Grok Bot's and Cursor's do. It shows MCP servers, skills, what runs on this machine, hooks, setup, and then an Information table. It is also the consent screen: nothing is saved before Add.
5. **Show what an entry is, and ask before adding it:**
   - its verified namespace or publisher
   - the URL's host, and whether it matches the namespace
   - what it needs (sign-in, keys, processes)
   - registry status
   - Any later change to an add-on's definition asks again.
6. **Bots see every add-on's tools.** libfx fixes tools per agent, so a bot's add-ons are enforced inside each tool's `execute()`, its skills catalog, and its instructions, not by hiding tools.

## 3. Implementation

### Sources (`packages/sdk/src/registry.ts`)

- **MCP servers.** Every hour, the SDK reads `<registry>/v0.1/servers?version=latest&limit=100`, page by page, then incrementally with `updated_since`.
  - The default `<registry>` is `https://api.mcp.github.com`.
  - Entries are kept in `registry_entries`. A failed sync keeps the old copy and shows when it was taken.
  - It respects `cache-control` and the rate-limit headers.
- **Everything mode.** `https://registry.modelcontextprotocol.io/v0.1/servers?search=<q>&version=latest`, only when the user turns it on. One request per search, with at least 3 characters, cached for 5 minutes.
- **Plugins.** Every hour, each marketplace's `.claude-plugin/marketplace.json` is read at its repository's current commit.
  - The defaults are Anthropic's official marketplace and the project's own ([question 2](#5-open-questions)).
  - An entry without a pin is shown but can't be added, except a relative path, which the marketplace's commit pins.
- **Skills.** `https://skills.sh/api/search?q=<q>&limit=20`, once per search after typing stops, with at least 2 characters. Results are cached for 5 minutes, and a setting turns this source off ([question 3](#5-open-questions)).
- **Installed add-ons.** Each is checked hourly for these, which only mark it; nothing updates on its own:
  - a `deprecated` or `deleted` status
  - a newer registry entry
  - a newer pin in its marketplace
  - a newer commit of its skill's repository

### Search

- `addons.search(q, { kind })` ranks local entries by name, title, and description. It adds skills.sh results after them, and returns small cards:
  - `kind`: MCP server, skill, or plugin
  - `title` and `description`. skills.sh gives no description, so its cards show the repository.
  - the namespace or publisher
  - for a remote MCP server, its `host`, and whether it matches the namespace's domain
  - `auth`: the entry's `secret headers`. Whether a server uses OAuth is learned when it's opened.
  - stars from GitHub's `_meta`, or installs from skills.sh, and `status`
- Registry and marketplace text is shown as plain text, never HTML. Remote icons are not loaded ([question 5](#5-open-questions)).

### The add-on page

Opening a card fetches the add-on's definition and shows its page. The definition is a registry entry, a plugin at its pin, or a skill at its commit. Nothing is saved yet. The page for herdr, the first plugin ([plugins](plugins.md#fxbots-extension)):

```text
herdr                                                         [Add]
Drive herdr agents and panes from a bot

MCP servers  1
  herdr                    runs on this machine · starts read-only
Skills  1
  herdr                    When and how to work with herdr's agents and panes
Runs on this machine
  uvx --from git+https://github.com/aelaguiz/herdr-mcp@<commit> herdr-mcp
Setup
  herdr                    found by: herdr --version
                           else: sh -c "curl -fsSL https://herdr.dev/install.sh | sh"   flagged: curl | sh
  uvx                      found by: uvx --version
Hooks
  turn.end                 node ./<namespace>/hooks/report.js

Information
  Includes      1 MCP server, 1 skill, 1 hook
  Publisher     fxbot
  Website       herdr.dev
  Source        the project's marketplace, at <commit>
```

- **Sections,** each shown only when the add-on has one:
  - **MCP servers:** each server's name, host, and sign-in (none, keys, or OAuth, found by probing it). See [mcp.md](../_completed/phases/mcp.md#adding-a-server).
  - **Skills:** each skill's name and description, five at a time, each opening its text. See [skills.md](skills.md#adding-skills).
  - **Runs on this machine, Hooks, and Setup:** every command with its arguments, untruncated. `sh -c`, `curl | sh`, and `sudo` are flagged. See [plugins.md](plugins.md#installing).
  - **Not used by fxbot:** a count of each part that fxbot doesn't run, such as commands, agents, LSP servers, and other clients' hooks.
  - **Information:**
    - what it includes
    - the publisher and verified namespace
    - category, website, and license
    - the source and its pin, and whether that source is curated
- **Add** records a hash of the definition and saves the add-on, then the add-on's own flow runs: secrets, sign-in, settings, or setup.
  - The server fetches the definition again, and refuses if its hash differs from the page's.
- **Changes.** A changed definition shows the page again, marking what changed, and needs Add again.

### Bots and add-ons

- A new add-on is for all bots ([question 4](#5-open-questions)). Its settings can switch it to chosen bots, and then each bot's settings, and the add-on's own, show a switch per bot. This is built for MCP servers ([mcp.md](../_completed/phases/mcp.md#built)).
- **A bot not chosen.** The bot comes from the session's `context`, never from the model. For that bot:
  - its tools refuse ("This tool is off for this bot")
  - its skills leave the bot's catalog
  - its hooks don't run
  - its instructions are left out of that bot's chats
- **Agents.** Every agent's tool list holds every enabled add-on's allowed tools. Adding, removing, enabling an add-on, or changing its allowed tools rebuilds the provider agents, after their running turns.
- **Token cost.** Every bot still sees every tool's schema, because libfx has no per-session tools.
  - fx loads MCP tools on demand (`capability_search`, `mcp_select_tool`), but libfx has no equivalent.
  - Many add-ons therefore cost tokens on every turn, and the Add-ons page shows a running count of tools.
  - Skills cost only their catalog lines.

### Postgres

```sql
addons          (id text primary key, kind text not null,          -- 'mcp' | 'skill' | 'plugin'
                 name text not null, source jsonb not null,         -- registry entry, marketplace entry, skills.sh result, or url, with its pin
                 config jsonb not null,                             -- url, transport, header names, or the plugin's parts
                 approved_hash text not null, enabled boolean not null default true,
                 bots text not null default 'all',                  -- 'all' | 'each'
                 allowed jsonb, status text, created_at timestamptz default now())   -- allowed tool names; null means the read-only ones
addon_secrets   (addon_id text primary key references addons on delete cascade, sealed bytea not null)
profile_addons  (profile_id text references profiles on delete cascade, addon_id text references addons on delete cascade,
                 enabled boolean not null, primary key (profile_id, addon_id))   -- read when bots is 'each'
registry_entries(source text, name text, version text, entry jsonb not null, updated_at timestamptz,
                 primary key (source, name))                        -- MCP registries and plugin marketplaces
```

- `addon_secrets` uses `seal` and `unseal` from `secrets.ts`, with the add-on id as AAD. It holds header values, OAuth tokens, registered clients, and plugin settings marked secret.
- Skills are kept in the `skills` table ([skills](skills.md#records-packagessdksrcskillsts)).

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `GET /api/addons/search?q=&kind=&everything=` | `addons.search(...)` |
| `POST /api/addons/preview` with `{ registry \| marketplace \| skill \| url }` | `addons.preview(ref)`: the add-on page's contents and hash. Nothing is saved |
| `POST /api/addons` with `{ ref, hash }` | `addons.add(ref, hash)`: fetches again, checks the hash, and saves |
| `GET /api/addons` | `addons.list()`: installed add-ons, with status, tool counts, and skill counts |
| `POST /api/addons/:id/update` with `{ hash }` | `addons.update(id, hash)`: moves to the newer definition the page showed |
| `PATCH /api/addons/:id` | `addons.change(id, { enabled?, bots?, allowed? })` |
| `PUT /api/profiles/:id/addons/:addon` | `addons.forBot(profile, addon, enabled)` |
| `DELETE /api/addons/:id` | `addons.remove(id)`: stops processes, deletes secrets and skills |

The routes that sign in, set secrets, read skills, and run setup are in [mcp.md](../_completed/phases/mcp.md#api-sdk-and-client), [skills.md](skills.md#api-sdk-and-client), and [plugins.md](plugins.md#api-sdk-and-client).

### UI

- An **Add-ons** page next to Settings has three parts:
  - a search field with kind filters (MCP servers, Skills, Plugins), and an "everything (unmoderated)" switch
  - result cards
  - an Installed list: one row per add-on with its status, allowed tools, and bots, an edit button for its settings, and an on switch
- A card opens the add-on page. Add saves it, then runs the add-on's own flow: secrets, sign-in, settings, or setup.
- Bot settings show a switch for each add-on given to chosen bots, and "All bots" for the rest.
- Components come from shadcn only.

### Where the code goes

- **`packages/sdk`:**
  - `registry.ts`: syncing and searching the MCP registries, the marketplaces, and skills.sh
  - `addons.ts`: records, previews, consent hashes, per-bot rules, and agent rebuilds
  - the tables in `store.ts`
- **`packages/server`:** the routes above.
- **`packages/ui`:** an `addons.tsx` page with search, the add-on page, and the Installed list, plus the add-on switches in bot settings.

### Security

- **No secrets in the page.** Secrets are write-only from the page and sealed. The page receives names, hosts, and statuses, never values.
- **The definition is what was approved.** The API takes references and the hashes the page was shown, never commands. Nothing the page sends is ever run.
- **Registry, marketplace, and skill text is untrusted.** It is never rendered as HTML.
- **A namespace proves who published an entry, not that it's safe.** The add-on page says so, and shows a domain mismatch plainly.
- **Requests the server makes:** the registries, the marketplaces' repositories on GitHub, and skills.sh, over HTTPS only. A skills search sends its words to skills.sh.

### Size

About 560 lines:

| Part | Lines |
| --- | --- |
| `registry.ts` | about 170 |
| `addons.ts` | about 110 |
| Routes | about 35 |
| Client | about 25 |
| UI, mostly the add-on page | about 220 |

Plus [mcp.md](../_completed/phases/mcp.md#size), [skills.md](skills.md#size), and [plugins.md](plugins.md#size).

## 4. Checklist

Checks use disposable Postgres, the [MCP checks'](../_completed/phases/mcp.md#4-checklist) mock server, and a mock registry served from the scratchpad. Nothing reaches the live sources except the human's checks. [Skills](skills.md#4-checklist) and [plugins](plugins.md#4-checklist) check their own sources when they join the search.

**M1. Sources**
- [ ] A sync reads every page of the mock registry, then only `updated_since` changes.
  - A failed sync keeps the old copy.
  - A 429 or a rate-limit header backs off.
- [ ] Everything mode asks once per search (3 characters or more) and caches for 5 minutes.

**M2. Search and the add-on page**
- [ ] Search ranks name over title over description, and filters by kind.
- [ ] A card shows the namespace, the host, the domain match, the secret headers, and a deprecated status.
- [ ] An MCP server's page shows its host, the sign-in its probe found, and the secret headers it asks for.
- [ ] Add saves only with the hash the page showed. A definition that changed in between is refused, and shown again.

**M3. Bots**
- [ ] A new add-on is for all bots. Switched to chosen bots, its tools refuse for a bot not chosen.
- [ ] Adding or removing an add-on rebuilds the agents after running turns.

**M4. UI and docs**
- [ ] Playwright: search, open a card, see the add-on page, add, find it in Installed, and give it to one bot.
- [ ] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**The human runs these:**
- one live sync of GitHub's registry, and one everything-mode search
- add a server found through search, and use it from a chat

## 5. Open questions

Each has a default.

1. **Default MCP source.** *Default:* GitHub's registry, mirrored hourly, with the base URL as a setting. The official registry is opt-in, per search.
2. **Plugin marketplaces.** *Default:* the project's own, which holds herdr, and Anthropic's official one, mirrored hourly.
   - The project's marketplace is a small public repo holding `.claude-plugin/marketplace.json` and fxbot's own plugins, curated by pull request.
   - Adding another marketplace takes its repo, with a warning that nobody reviewed it.
3. **skills.sh.** *Default:* on, with a setting to turn it off. Every skills search sends its words to skills.sh.
4. **Per-bot default.** *Default:* for all bots, switchable to chosen bots. A bot not chosen gets refused tools, no skills, and no instructions, though the schemas stay visible ([Bots and add-ons](#bots-and-add-ons)).
5. **Remote icons.** *Default:* not loaded, which avoids tracking and mixed content. Cards and pages show the add-on's initial. Grok Bot and Cursor show logos. fxbot could fetch raster icons on the server and serve them itself.
6. **A tool budget.** *Default:* no limit, but the page warns past 40 tools, because every bot pays for every schema.
