# Add-ons

One place to find and add the things that work with fxbot. A search box over live registries lists MCP servers, skills, and plugins, and one Add puts them into fxbot.
- An [MCP server](mcp.md) gives bots tools from a remote service.
- A [skill](../../phases/skills.md) is instructions that a bot reads when a task needs them.
- A [plugin](../../phases/plugins.md) bundles MCP servers and skills. It can also run code on this machine: local MCP servers, tooling such as herdr, and hooks.

Every add-on has a page that lists what it installs, like Grok Bot's plugin page.

This page owns what they share:
- where results come from
- the add-on page and consent
- the add-on records
- how bots get add-ons

Status: built on 2026-11-02, for MCP servers. The [MCP phase](mcp.md) built the add-on records, consent by hash, per-bot choice, and allowed tools. This phase added fxbot's own list of MCP servers, the mirror of GitHub's registry, everything mode, search, the add-on page for a registry entry, marks on installed add-ons, and Update. The Add-ons page is now a search above four tabs: Installed, Skills, MCP, and Plugins.

What this page says about skills and plugins (their sources, page sections, and records) is not built. [Skills](../../phases/skills.md) and [plugins](../../phases/plugins.md) add them to the same search and page; until then, their tabs say they aren't in fxbot yet.

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
- **skills.sh** answers `GET /api/search?q=` with no key. Each result is `{ id, source, skillId, name, installs }`, where `source` is a GitHub `owner/repo`, and has no description ([skills](../../phases/skills.md#1-research)).
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
- fxbot runs one agent per provider ([provider logins](provider-logins.md)), and every agent gets the same tool list.

## 2. Key takeaways

1. **Mirror curated sources, and search them locally.**
   - The server mirrors GitHub's MCP registry and the plugin marketplaces into Postgres every hour. The MCP registry takes about 8 requests, so searching stays on the machine, inside GitHub's 10-request limit.
   - skills.sh has no listing to mirror, so skills are searched there, once per search.
   - Searching the whole official registry is an opt-in, "everything, unmoderated" mode.
2. **Install from what entries already say.**
   - A registry entry's `remotes` become an [MCP server](mcp.md).
   - Its `packages` mean a process on this machine, so they install as a [plugin](../../phases/plugins.md).
   - A marketplace entry is a plugin, and a skills.sh result is a [skill](../../phases/skills.md).
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
6. **Bots see every add-on's allowed tools.** libfx fixes tools per agent, so a bot's add-ons are enforced inside each tool's `execute()`, its skills catalog, and its instructions, not by hiding tools. Only the tools the owner allows reach the agents at all.

## 3. Implementation

### Sources (`packages/sdk/src/registry.ts`)

- **fxbot's list.** The project's own picks, in `packages/sdk/src/mcp-registry.json`: one page of the registry's `/v0.1/servers`, each entry a standard `server.json`.
  - Each release ships with the file, and `npm run build-site` publishes it as `out/mcp-registry.json`.
  - With `FXBOT_MCP_FXBOT` set to the published copy, such as `https://<domain>/mcp-registry.json`, the server reads it every hour and it replaces the shipped one. A failed fetch keeps the last copy read. Without it, the shipped copy is the list.
  - Each copy is the whole list: an entry it lacks is gone, and an add-on from it is marked removed. A newer `version` marks the add-on for Update.
  - It is kept in `registry_entries` under the source `fxbot`. Its first entries are alphaXiv and Keiro, under their publishers' namespaces, `org.alphaxiv` and `cloud.keirolabs`.
- **MCP servers.** Every hour, the SDK reads `<registry>/v0.1/servers?version=latest&limit=100`, page by page, then incrementally with `updated_since`.
  - The default `<registry>` is `https://api.mcp.github.com`.
  - Entries are kept in `registry_entries`, without their README, and each sync's time and error in `registry_syncs`. A failed sync keeps the old copy and shows when it was taken.
  - A 429 waits out its `Retry-After`, and a spent rate limit waits for its reset. A sync stopped partway finishes next time.
  - An entry read live for its page is saved into the mirror too, so an add-on updated between syncs isn't marked with an older version.
  - `FXBOT_MCP_REGISTRY` sets `<registry>`.
- **Everything mode.** `https://registry.modelcontextprotocol.io/v0.1/servers?search=<q>&version=latest`, only when the user turns it on. One request per search, with at least 3 characters, cached for 5 minutes. `FXBOT_MCP_EVERYTHING` sets its base URL.
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

- `addons.search(q, { kind, everything })` searches fxbot's list and the mirror, one card per server, fxbot's when both have it. It ranks by the server's own name (after the `/`), then its title, then its namespace, then its description, and within each, fxbot's first, then by stars, 20 at most. No words lists fxbot's, then the most-starred. Deleted entries never show. Everything mode adds the official registry's results that neither has. Skills.sh results will come after them. It returns small cards:
  - `kind`: MCP server, skill, or plugin
  - `from`: fxbot's list, GitHub's registry, or the official one
  - `title` and `description`. skills.sh gives no description, so its cards show the repository.
  - the namespace or publisher
  - for a remote MCP server, its `host`, and whether it matches the namespace's domain
  - `needs: "key"` when the entry has a secret header. Whether a server uses OAuth is learned when it's opened.
  - `local` for an entry that runs only as a package
  - stars from GitHub's `_meta`, or installs from skills.sh, and `status`
- Registry and marketplace text is shown as plain text, never HTML. Remote icons are not loaded ([question 5](#5-open-questions)).

### The add-on page

Opening a card fetches the add-on's definition and shows its page. The definition is a registry entry, a plugin at its pin, or a skill at its commit. Nothing is saved yet. The page for herdr, the first plugin ([plugins](../../phases/plugins.md#fxbots-extension)):

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
  - **MCP servers:** each server's name, host, and sign-in (none, keys, or OAuth, found by probing it). See [mcp.md](mcp.md#adding-a-server).
  - **Skills:** each skill's name and description, five at a time, each opening its text. See [skills.md](../../phases/skills.md#adding-skills).
  - **Runs on this machine, Hooks, and Setup:** every command with its arguments, untruncated. `sh -c`, `curl | sh`, and `sudo` are flagged. See [plugins.md](../../phases/plugins.md#installing).
  - **Not used by fxbot:** a count of each part that fxbot doesn't run, such as commands, agents, LSP servers, and other clients' hooks.
  - **Information:**
    - what it includes
    - the publisher and verified namespace
    - category, website, and license
    - the source and its pin, and whether that source is curated
- **Add** records a hash of the definition and saves the add-on, then the add-on's own flow runs: secrets, sign-in, settings, or setup.
  - The server fetches the definition again, and refuses if its hash differs from the page's.
- **Changes.** A changed definition shows the page again, marking what changed, and needs Add again.
- **In this phase,** only MCP server entries reach the page, with their MCP servers section and Information. An entry that runs only as a package (`packages`, a process on this machine) shows its page with "Runs on this machine: comes with plugins", and no Add, until the [plugins](../../phases/plugins.md) phase.

### Bots and add-ons

- A new add-on is for all bots ([question 4](#5-open-questions)). Its settings can switch it to chosen bots, and then each bot's settings, and the add-on's own, show a switch per bot. This is built for MCP servers ([mcp.md](mcp.md#built)).
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

registry_syncs  (source text primary key, synced_at timestamptz, started_at timestamptz, error text)
```

- `addons`, `addon_secrets`, and `profile_addons` are the MCP phase's (`0001_baseline`). `registry_entries` and `registry_syncs` are migration `0003_registry_entries`.
- A registry add-on's `source` is `{ registry, version, everything? }`: its entry's name and the version added.
- `addon_secrets` uses `seal` and `unseal` from `secrets.ts`, with the add-on id as AAD. It holds header values, OAuth tokens, registered clients, and plugin settings marked secret.
- Skills are kept in the `skills` table ([skills](../../phases/skills.md#records-packagessdksrcskillsts)).

### API, SDK, and client

Built here marks what this phase added: two routes, the marks, and the Information the preview returns for a registry entry.

| Route | SDK call | |
| --- | --- | --- |
| `GET /api/addons/search?q=&kind=&everything=` | `addons.search(...)` | built here |
| `POST /api/addons/preview` with `{ registry \| marketplace \| skill \| url }` | `addons.preview(ref)`: the add-on page's contents and hash. Nothing is saved | MCP phase; `info` and `local` here. `marketplace` and `skill` come later |
| `POST /api/addons` with `{ ref, hash }` | `addons.add(ref, hash)`: fetches again, checks the hash, and saves | MCP phase |
| `GET /api/addons` | `addons.list()`: installed add-ons, with status, tool counts, and their marks | MCP phase; `info` and `mark` here |
| `POST /api/addons/:id/update` with `{ hash }` | `addons.update(id, hash)`: moves to the newer definition the page showed | built here |
| `PATCH /api/addons/:id` | `addons.change(id, { enabled?, bots?, allowed? })` | MCP phase |
| `PUT /api/profiles/:id/addons/:addon` | `addons.forBot(profile, addon, enabled)` | MCP phase |
| `DELETE /api/addons/:id` | `addons.remove(id)`: stops processes, deletes secrets and skills | MCP phase |

The routes that sign in, set secrets, read skills, and run setup are in [mcp.md](mcp.md#api-sdk-and-client), [skills.md](../../phases/skills.md#api-sdk-and-client), and [plugins.md](../../phases/plugins.md#api-sdk-and-client).

### UI

The Add-ons page is a search above four tabs. The search covers every tab, and a tab counts its matches while there are words.

```text
Add-ons
[ Search add-ons…                                                ]
[ Installed 2 |  Skills  |  MCP 20+  |  Plugins ]
┌──────────────────────────────────────────────────────────────────┐
│ Linear                                            [edit]  [on]   │
│ Connected · 12 of 23 tools · All bots                            │
├──────────────────────────────────────────────────────────────────┤
│ Notion  Update available                          [edit]  [on]   │
│ Connected · 8 of 8 tools · 2 bots                                │
└──────────────────────────────────────────────────────────────────┘
52 tools reach your bots. Past 40, every message carries more.
```

- **The page opens on Installed,** or on MCP while nothing is installed.
- **Installed** is the MCP phase's list, narrowed by the search: each row's name, status, allowed tools, and bots, an edit button, and an on switch.
  - The hourly check marks a row **Update available**, **Deprecated**, or **Removed from the registry**.
  - The tool count shows under the list once more than 40 tools reach the bots ([question 6](#5-open-questions)).
  - When none match, a link goes to the matches under MCP.
- **MCP** searches GitHub's registry as you type:

  ```text
  [ ] Search everything (unmoderated)                 Add by address
  ┌─────────────────────────────────────────────────────────┐
  │ (L) Linear                 app.linear/linear     ★ 1.2k │
  │     Issues, projects, and cycles from Linear            │
  │     mcp.linear.app · Needs a key                        │
  ├─────────────────────────────────────────────────────────┤
  │ (G) GitHub                 io.github.github/...  ★ 34K  │
  │     ...                                                 │
  └─────────────────────────────────────────────────────────┘
  ```

  1. **A card** shows the add-on's initial instead of a remote icon ([question 5](#5-open-questions)): its title, its name, one line of description, its host, marked in red when it isn't on the namespace's domain, what it needs, its stars, a deprecated status, and **Added** when its name or address is installed. A tag says where it comes from: **fxbot** (filled), **GitHub registry**, or **Official registry**.
  2. **Opening a card** shows its add-on page in a dialog. **Add** saves it, then runs the add-on's own flow: for an MCP server, its key fields or its sign-in. The page then shows Installed.
  3. **Search everything (unmoderated)** adds the official registry's results.
  4. **Add by address** opens the MCP phase's form, for a server no registry lists.
- **Skills and Plugins** say they aren't in fxbot yet, until their phases.
- **The edit dialog** (the MCP phase's) gains, for an add-on from a registry, its Information at the version it is on, and when there is a newer one, **Update to <version>**. That shows what changes (the version, address, sign-in, and headers), and nothing moves until **Update**.
- **Bot settings** are unchanged: a switch for each add-on given to chosen bots, and "All bots" for the rest.
- Components come from shadcn only.

### Where the code goes

- **`packages/sdk`:**
  - `registry.ts`: the hourly mirror of GitHub's registry, everything mode, search and its ranking, and the marks on installed add-ons. Skills and plugins add their sources here.
  - `mcp.ts`: records, previews, consent hashes, per-bot rules, and agent rebuilds, from the MCP phase. This phase added `update(id, hash)`, the Information a registry entry gives its page, and package-only entries.
  - `migrations/0003_registry_entries.sql`: the mirror's tables.
  - `addons.ts` waits for a second kind of add-on: until skills arrive, MCP servers are the only one, and `mcp.ts` holds them.
- **`packages/server`:** two routes, search and update.
- **`packages/ui`:**
  - `addons.tsx`: the page's search and tabs, Installed with its marks and tool count, and the edit dialog's From the registry.
  - `addon-add.tsx`: the search, the MCP tab's cards, the add-on page, and the add-by-address form.

### Security

- **No secrets in the page.** Secrets are write-only from the page and sealed. The page receives names, hosts, and statuses, never values.
- **The definition is what was approved.** The API takes references and the hashes the page was shown, never commands. Nothing the page sends is ever run.
- **Registry, marketplace, and skill text is untrusted.** It is never rendered as HTML.
- **A namespace proves who published an entry, not that it's safe.** The add-on page says so, and shows a domain mismatch plainly.
- **Requests the server makes:** the registries, the marketplaces' repositories on GitHub, and skills.sh, over HTTPS only. A skills search sends its words to skills.sh.

### Size

Planned at about 420 lines. Built in about 570, mostly in the UI, which became a page of tabs instead of one dialog.

| Part | Planned | Built |
| --- | --- | --- |
| `registry.ts`: the mirror, everything mode, search, and the marks | about 170 | 215 |
| `mcp.ts`: `update`, package-only entries, and the page's Information | about 40 | about 45 |
| The migration, two routes, types, and the client | about 30 | about 60 |
| UI: search, tabs, the cards, the add-on page, the marks, and the tool count | about 180 | about 250 |

Plus [skills.md](../../phases/skills.md#size) and [plugins.md](../../phases/plugins.md#size), which add their own sources and page sections.

## 4. Checklist

All checked on 2026-11-02: 37 checks in the SDK, 35 in a browser, and the MCP phase's 67 again. Checks use disposable Postgres, the [MCP checks'](mcp.md#4-checklist) mock server, and a mock registry served from the scratchpad. Nothing reaches the live sources except the human's checks. [Skills](../../phases/skills.md#4-checklist) and [plugins](../../phases/plugins.md#4-checklist) check their own sources when they join the search.

**M1. Sources**
- [x] A sync reads every page of the mock registry, then only `updated_since` changes.
  - A failed sync keeps the old copy.
  - A 429 or a rate-limit header backs off.
- [x] Everything mode asks once per search (3 characters or more) and caches for 5 minutes.

**M2. Search and the add-on page**
- [x] Search ranks name over title over description, and filters by kind.
- [x] A card shows the namespace, the host, the domain match, the secret headers, and a deprecated status.
- [x] An MCP server's page shows its host, the sign-in its probe found, and the secret headers it asks for.
- [x] Add saves only with the hash the page showed. A definition that changed in between is refused, and shown again.
- [x] An entry that runs only as a package shows its page with "comes with plugins", and no Add.
- [x] Cards and pages show the add-on's initial, and the page requests no remote icon.

**M3. Installed add-ons**
- [x] The hourly check marks an installed add-on deprecated, removed, or with a newer version, and changes nothing else.
- [x] Update shows what changed in the newer version, and moves the add-on to it only after Update.
- [x] Past 40 tools reaching the bots, the page says how many.
- [x] The MCP phase's checks for bots run again and still pass: a new add-on is for all bots, a bot not chosen is refused its tools, and adding or removing rebuilds the agents after running turns.

**M4. UI and docs**
- [x] Playwright: search above the tabs, open a card, see its page, close it, open it again, Add, find it under Installed, give it to one bot, and update a marked row. At phone width too.
- [x] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

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
