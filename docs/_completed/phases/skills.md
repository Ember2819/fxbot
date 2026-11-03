# Skills

Bots use skills: [Agent Skills](https://agentskills.io/specification), folders with a `SKILL.md`. Skills come from [add-ons](addons.md): a skill found on skills.sh, the skills inside a [plugin](plugins.md), or the skills an [MCP server](mcp.md) serves. Each bot sees a short list of its skills, and reads one only when a task needs it.

This page's first idea was that profiles grow skills from use, kept small enough to read and audit. That comes later and builds on the same records and tool ([Later](#later-skills-bots-write)).

Status: built on 2026-11-02, for 0.2.0. [Add-ons](addons.md) built the records, per-bot choice, consent by hash, the search over tabs, and the marks and Update. This phase added skills from skills.sh and from fxbot's own skills list, the `skill` tool, and each bot's catalog. Every skill installs the way skills.sh installs it, from a GitHub repository, and is kept as libfx's own `SkillRecord`. Skills that MCP servers serve come after 0.2.0 ([question 5](#5-open-questions)). Plugins' skills come with [plugins](plugins.md).

## 1. Research

These are read from specs, source, docs, and read-only requests, as of November 2026. Paths are relative to each repository.

**The Agent Skills format** ([specification](https://agentskills.io/specification))
- **A skill is a folder** with a `SKILL.md`: YAML frontmatter, then instructions in markdown. It can also hold `scripts/` ("executable code"), `references/` ("additional documentation"), and `assets/` ("static resources").
- **Frontmatter.**
  - `name` is required: "Max 64 characters. Lowercase letters, numbers, and hyphens", and it must "match the parent directory name".
  - `description` is required: "Max 1024 characters. Non-empty". It says what the skill does and when to use it.
  - The rest are optional: `license`, `compatibility` (up to 500 characters), `metadata` (a map of strings), and `allowed-tools` ("Experimental").
- **Progressive disclosure.** The "name and description … loaded at startup", and the "full SKILL.md body is loaded when the skill is activated", with "< 5000 tokens recommended". Other files load "only when required".
- **Clients that can't read files** ([adding skills support](https://agentskills.io/client-implementation/adding-skills-support)).
  - A tool like `activate_skill` "is required when the model can't read files directly". The guide suggests constraining its name "as an enum".
  - The catalog lists each skill's name and description, for example as `<available_skills>`, in the system prompt or the tool's description. "Each skill adds roughly 50-100 tokens".
  - Disabled skills are hidden from the catalog, and with no skills there is no catalog and no tool.

**libfx 0.0.16** (`libfx/skills` and `libfx/skills/node`, read in the installed package and run here)
- `SkillRecord` is libfx's skill: `{ name, instructions, description?, resources?: [{ uri, text }], tools? }`.
- `createSkillsAdapter(records)` turns records into `{ instructions, tools }` for the agent's options. Each skill renders as `<skill name="pdf"><description>…</description>` with its body and every resource as `<resource uri="…">…</resource>`, then `</skill>`. It throws past 64 skills or 64 KiB. Nothing loads on demand, and the agent is fixed when it's made.
- `loadSkillFile(path, { readFile })` "reads one `SKILL.md` and nothing it references", and `readFile` can serve the text from memory. Run here on six headers, it read a plain one right, but:
  - `description: >` and `description: |` came back as `>` and `|`
  - a quoted description kept its quotes
  - a file with Windows line endings came back with no frontmatter, named `SKILL` after the file

**How a person names a skill** (checked on 2026-11-02)
- **fx:** `$` opens a skill picker, fuzzy by "each word and its letters in order", so `fxcommit` finds `fx-commit`; `$review-tests Review the tests…` works typed by hand, and `/skills` browses them. fx "loads the selected skill's full instructions when you send the prompt" ([skills](https://fx.sh/docs/capabilities/skills.md)).
- **Codex:** `$` or `/skills`. Explicit invocation includes the skill in the prompt, and still works for a skill that turned off the model choosing it ([skills](https://developers.openai.com/codex/skills)).
- **Grok Bot:** `/` in a conversation lists the bot's skills, as third parties describe it.
- **Claude Code:** `/skill-name args`. A skill with `disable-model-invocation: true` works only that way.

**How other clients load skills**
- **Claude Code** ([skills](https://code.claude.com/docs/en/skills)). "skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked". "The listing always contains every skill name", and it drops descriptions past a budget that "scales at 1% of the model's context window".
- **fx** ([skills](https://fx.sh/docs/capabilities/skills.md), [context limits](https://fx.sh/docs/configure-fx/context-limits.md)).
  - The catalog gives each description up to 1 KiB, within a budget "estimated from 2% of the model's context window". When the window is unknown, the budget is 8,000 characters.
  - The `skill` tool reads a skill and its references. `capability_search` finds "installed skills and configured MCP tools", and replaced `skill_search` (CHANGELOG).
  - `/skills install vercel-labs/skills --skill find-skills` installs from a repository.
- **eve** (`docs/skills.mdx`).
  - "A skill is a procedure the model reads only when a task needs it, instead of carrying it on every turn." `eve__skill({ name })` loads one.
  - A `deferred` skill stays out of the prompt until `eve__search` finds it. "Loading a skill adds instructions, never tools."
  - eve searches skills.sh as its `@skills` registry.
- **Grok Bot** ([skills](https://docs.x.ai/grok-bot/skills-routines-and-automations)).
  - Users "discover and install supported apps and packaged skills", or "ask the Bot for it by name".
  - Private skills are "one library shared by all your Bots", turned on per Bot "under Private skills".
  - Bots "use the description to decide when it applies".

**Where skills come from**
- **skills.sh.**
  - The `skills` CLI searches with `GET https://skills.sh/api/search?q=…&limit=20`, with no key (vercel-labs/skills `src/find.ts`).
  - Checked here: `q=twilio` answered `{ query, searchType: "fuzzy", skills: [{ id, source, skillId, name, installs }], count }`. Results carry no descriptions. Checked again on 2026-11-02 with `q=pdf`: the same shape, ranked by installs, `anthropics/skills/pdf` first with about 221,000.
  - The documented `/api/v1/` needs a Vercel OIDC token ([API](https://skills.sh/docs/api)).
- **Repositories.** `npx skills add owner/repo --skill name` looks in the usual places, then walks the tree up to 5 levels deep (`src/skills.ts`). The usual places are:
  - the root
  - `skills/`
  - dozens of agent folders, such as `.agents/skills` and `.claude/skills`
  - the paths a Claude plugin manifest lists (`src/plugin-manifest.ts`)
- **Plugins.** The shared Agent Plugins format has "exactly two component types: skills and MCP servers", with skills at `skills/<name>/SKILL.md` ([plugins](plugins.md#1-research)).
  - Twilio's plugin holds 57 skills, from 4 KB to 37 KB each and 632 KB in all (`twilio/ai`, counted here).
- **GitHub without its API.** `GET https://github.com/<owner>/<repo>.git/info/refs?service=git-upload-pack` answers with the commit `HEAD` points at, without a key and outside the API's 60-an-hour limit, and `https://codeload.github.com/<owner>/<repo>/tar.gz/<commit>` serves that commit's files. Both were checked here against `anthropics/skills`.
- **MCP servers.** The `io.modelcontextprotocol/skills` extension (SEP-2640, at the Beta stage) lets a server serve skills ([overview](https://modelcontextprotocol.io/extensions/skills/overview)).
  - A server that declares it "MUST implement `skills/list` and `skills/get`", and serves each file through `resources/read`, conventionally under `skill://`.
  - The TypeScript SDK ships it in v2.4.0, the version fxbot uses: `@modelcontextprotocol/client/ext/skills` has a `SkillsClient` that lists, gets, and reads skills, and checks each file's size and digest. A community list names Hugging Face, Cloudflare's API server, Outline, and n8n among the servers that serve skills (`docs/implementations.md`).
  - Hosts "MUST treat MCP-served skill content as untrusted model input", "MUST tag MCP-served skill content with its originating server identity", and "MUST resolve skill names within a per-origin namespace". No skill may run code without "explicit per-skill user approval" (`specification/beta/skills.mdx`).

## 2. Key takeaways

1. **Skills are libfx's `SkillRecord`s, loaded on demand.** fxbot keeps each skill as a `SkillRecord`, and the `skill` tool answers with `createSkillsAdapter`'s own rendering of that one skill. Every reference lists names and descriptions and reads a skill's text only when a task needs it, so fxbot doesn't put every skill into the agent: libfx's adapter stops at 64 skills or 64 KiB, Twilio's 57 skills alone are 632 KB, and one agent serves every bot on its provider.
2. **Every skill installs as skills.sh installs it:** a `<owner>/<repo>/<skillId>` from a GitHub repository, found by `name` the way `npx skills` finds it. fxbot's own list names its skills the same way, so a skill on both is the same skill.
3. **One tool reads them.** `skill` is a host tool on every agent, like `chat_history`. libfx fixes tools per agent, so the tool checks `context.bot` and serves only that bot's skills.
4. **Each bot's catalog has a budget.**
   - It joins the bot's instructions per session, which libfx allows.
   - Every name is listed. Descriptions fill up to 1% of the model's context window, or 8,000 characters when the window is unknown. The tool's search finds the rest.
5. **One library, switched per bot,** as in Grok Bot. An add-on's skills follow the add-on's per-bot switch ([add-ons](addons.md#bots-and-add-ons)).
6. **Skills are text in Postgres.** fxbot keeps the body of `SKILL.md` and the folder's other text files as the record's resources. Bots have no shell, so a bot can read `scripts/` but they never run.
7. **Skills from an MCP server stay with that server.** fxbot lists them with the server, reads them through it, and labels them with its name, as the extension requires. That comes after 0.2.0.
8. **A skill is someone else's instructions.** It is pinned, shown in full before it's added, capped in size, and confirmed again when it changes.

## 3. Implementation

### Records (`packages/sdk/src/skills.ts`, migration `0004_skills`)

A skill is an add-on of kind `skill`, in the `addons` table the MCP phase built, with the same `enabled`, `bots`, and per-bot rows in `profile_addons`. Its `SkillRecord` is in a new table:

```sql
skills (addon_id text not null references addons on delete cascade,
        name text not null, description text not null,
        instructions text not null,         -- the body of SKILL.md
        resources jsonb not null,           -- [{ uri, text }]: the folder's other text files, as skill://<name>/<path>
        primary key (addon_id, name))
```

- **One add-on, one skill.** A skill from skills.sh or fxbot's list is one add-on. The table holds more than one per add-on for [plugins](plugins.md), which bring many.
- **Source.** `{ skill: "<owner>/<repo>/<skillId>", commit, from: "fxbot" | "skills.sh" }`: the id both lists use, the commit the files came from, and the list it was found in.
- **Parsing.** fxbot reads the frontmatter with the `yaml` package, which has no dependencies, pinned exactly, and builds the `SkillRecord` itself, since libfx's `loadSkillFile` misreads folded and quoted descriptions and Windows line endings.
  - `name` and `description` are required, with the spec's limits.
  - A skill that fails says why on its page, and has no Add.
  - Claude Code's `disable-model-invocation: true` means a person calls the skill, not the model. fxbot leaves such a skill out of the catalog's descriptions and names it on a line after them, to load only when the person asks for it by name. `humanlayer/skills/show-me` is one.
- **Limits.** Text files up to 256 KiB each, and 2 MiB per skill. Binary files, such as images, are skipped and listed as skipped.
- **Names.** A bot sees a skill by its own `name`. When two installed skills share one, the later is `<repo>:<name>`.

### Reading a repository (`packages/sdk/src/archive.ts`)

- `info/refs` gives the commit `HEAD` points at. The page, Add, and Update all use that commit, so what was shown is what is saved.
- The archive of that commit is streamed through `gunzip` and a small tar reader. Nothing is written to disk.
  - Only regular files are read: no links, and every path stays inside the repository's folder.
  - The download stops past 50 MB, and text files past the limits are skipped.
- The skill is found as `npx skills` finds it: a `SKILL.md` up to 5 folders deep whose `name` is the skillId, or else whose folder is. Its folder's files are the skill.
- A repository read once is kept for 5 minutes, so opening a page and then adding it reads it once.

### The catalog

`instructionsFor(profile)` in `index.ts` already builds each session's instructions. It gains the bot's catalog after the bot's own instructions:

```text
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, call the skill tool with the skill's name to load its full instructions.
<available_skills>
<skill><name>pdf</name><description>Use this skill whenever the user wants to do anything with PDF files…</description></skill>
…
</available_skills>
```

- **What's listed.** Only the skills of add-ons that are on and given to this bot. A bot with none gets no catalog. Skills only a person calls follow it, as "Load these skills with the skill tool only when the person asks for one by name: show-me."
- **The budget.**
  - It is 1% of the model's context window, at 4 characters per token. The window comes from the provider's own setting, or the model list fxbot keeps. When neither knows it, the budget is 8,000 characters.
  - Every name stays. Descriptions are kept in the order skills were added, until the budget runs out.
  - When any are dropped, the catalog says to search with `skill({ search })`.
- **Changes** reach a chat at its next turn, since every turn opens the session with its instructions.

### The `skill` tool

| Call | Answer |
| --- | --- |
| `skill({ name })` | The skill's `SKILL.md` body, and a list of its other files |
| `skill({ name, file })` | One of those files, such as `references/forms.md` |
| `skill({ search })` | Up to 10 of the bot's skills that match, by name and description |

- **Which skills.** It answers only for skills that are on for `context.bot`, as MCP tools check it, and answers an unknown name with the closest names.
- **Its answer is libfx's.** `skill({ name })` returns `createSkillsAdapter([record]).instructions` for that one skill, with its resources listed by `uri` instead of inlined, so a 2 MiB skill doesn't arrive whole. `skill({ name, file })` returns one resource.
- **Registration.** It is a host tool beside `chat_history`, `idempotent: true` since it only reads. It is on every agent once any skill is installed, and the agents are rebuilt when that changes, as for MCP servers.
- **In the chat** it reads "Read a skill", with the skill's name beside it, like fxbot's other tools.
- **Long files** come back in parts of 60 KB, with `part`, since libfx refuses a host tool's result over 64 KiB.

### Naming a skill in a message

- **The picker.** In a chat, `$` after a space or at the start, or `/` at the very start, opens a list of the bot's skills above the message box, narrowed as you type, as fx's is: the name's start, then anywhere in it, then its letters in order, then the description. Arrows move, Enter or Tab picks, and Escape closes. A `$` that matches no skill, as in "$5", opens nothing; a `/` on a bot without skills says it has none.
- **A pick is a chip** in the message box, beside its files. Sending puts each chip first, as `$name`. The bubble turns those leading names back into chips.
- **The server reads the names,** so typing `$show-me` by hand, or sending through the API, does the same: `$name` anywhere, or `/name` at the start, for a skill on for the bot. Any other `$` is text.
- **The skill goes with the message,** as a libfx resource block, `skill://<name>/SKILL.md`, with the same rendering the `skill` tool returns, cut at 60 KB with a note to read the rest. The bot has it without a tool call, and it stays in the chat's history for later turns, which a skill such as `grilling`, asked over several rounds, needs. libfx shows the block to the model as `File: skill://…`.
- **The chat shows the message as typed,** not the skill's text: what was sent is kept as for files.

### Sources

- **skills.sh.** `https://skills.sh/api/search?q=<q>&limit=20`, once typing stops (2 characters or more), cached for 5 minutes. Each search sends its words to skills.sh.
- **fxbot's skills list.** The project's own picks, like its [MCP list](addons.md#sources-packagessdksrcregistryts), in skills.sh's own format so that each entry installs the same way:

  ```json
  { "skills": [{ "id": "anthropics/skills/pdf", "source": "anthropics/skills", "skillId": "pdf", "name": "pdf",
                 "description": "Read, fill, and make PDF files" }] }
  ```

  - `description` is fxbot's addition, since skills.sh results have none, so fxbot's cards say what they do.
  - It ships as `packages/sdk/src/skills-registry.json`, and `npm run build-site` publishes it as `out/skills-registry.json`, beside `mcp-registry.json`.
  - With the published site set, the server reads it every hour, and it replaces the shipped one. A failed fetch keeps the last copy read.
  - Its entries are searched on this machine, by name and description, and listed first.
  - **Its first skills,** the owner's picks, checked on 2026-11-02:
    - `humanlayer/skills/show-me`: explains the topic at hand with the smallest picture, such as a call tree, a file tree, Mermaid, or a diff.
    - `anthropics/skills/frontend-design`: direction for distinctive interface design.
    - `mattpocock/skills/grilling`: interviews you about a plan until it holds up. It is the skill `grill-me` sends Claude Code to.
    - `vercel-labs/skills/find-skills` is left out: it tells the bot to run `npx skills`, and fxbot's bots have no shell. Skills are found on the Skills tab instead.
- **One setting for both lists.** `FXBOT_LISTS_URL` is the site that publishes them, such as `https://<domain>`. fxbot reads `/mcp-registry.json` and `/skills-registry.json` from it. It replaced the MCP list's own setting before any release had it.
- **Duplicates.** A skill in both shows once, as fxbot's.

### Updates

- Every hour, and a minute after start, each skill's repository is asked for its `HEAD` commit, once per repository. `addons.check()` runs the same check at once.
- When it moved, the archive is read again, and the add-on is marked **Update available** only when its skill's files changed. A repository that moved without touching the skill marks nothing.
- **Update to the latest** shows which files changed, were added, or were removed, then **Update**, as for MCP servers.
- A skill gone from its repository is marked **Removed from its repository**. It keeps working as added.

### API, SDK, and client

| Route | SDK call | |
| --- | --- | --- |
| `GET /api/addons/search?kind=skill&q=` | `addons.search(q, { kind: "skill" })`: fxbot's skills, then skills.sh's, as cards. The client's `searchSkills(q)` | new kind |
| `POST /api/addons/preview` with `{ skill, from? }` | `addons.preview(ref)`: the skill's page, its SKILL.md, its files, and a hash | new ref |
| `POST /api/addons` with `{ ref, hash }` | `addons.add(ref, hash)`: reads the repository again, checks the hash, and saves | built |
| `GET /api/addons/:id/skills?file=` | `addons.readSkill(id, file?)`: a file's text, for the page; SKILL.md by default | new |
| `GET /api/profiles/:id/skills` | `profiles.skills(id)`: the bot's skills, for its chat's picker | new |
| `POST /api/profiles/:id/messages` | `send(id, message)`: a `$name` in the text, or `/name` at its start, sends that skill along | built; the names are new |

`list`, `change` (on, and all or chosen bots), `forBot`, `update`, and `remove` are the [add-ons](addons.md#api-sdk-and-client) routes, which pass a skill add-on to `skills.ts` instead of `mcp.ts`. `Addon` gains `kind: "skill"`, with its skills' names and descriptions instead of tools, and no address or sign-in.

### UI

- **The Skills tab** lists fxbot's skills first, tagged **fxbot**, with their descriptions, then skills.sh's results for the words above the tabs, tagged **skills.sh**, with the skill's name, its repository, and its installs. skills.sh gives no description. With no words, it lists fxbot's skills only, as "fxbot's picks". The tab counts its matches while there are words, and a card says **Added** when its skill is installed.
- **A skill's page**, in a dialog as an MCP server's is:

  ```text
  pdf                                                     [x]
  Use this skill whenever the user wants to do anything with PDF files…

  Skill
    SKILL.md                    8.2 KB            [Read]
    forms.md, reference.md      2 more files
    scripts/                    3 files, read but never run
  Information
    Repository   anthropics/skills, at ca45fc4
    License      Proprietary. LICENSE.txt has the terms
    Installs     221,060 on skills.sh
  [Add pdf]
  ```

  - **Read** shows SKILL.md's text in the page, as plain text. The other files are listed with their sizes, and read in the skill's settings once it is added.
  - A skill that fails to parse says why, and has no Add.
- **Installed** lists a skill like a server: its name, "Skill · All bots" or its bots, an edit button, and an on switch. Its settings hold All bots or Choose, its files to read, From its repository with **Update to** when marked, and Remove. When nothing is installed, the page offers Browse skills and Browse MCP servers.
- **A bot's settings** list skills with the add-ons, as they list servers now.
- Components come from shadcn only.

### Where the code goes

- **`packages/sdk`:**
  - `skills.ts`: records, parsing, the catalog, the tool, previews, and updates.
  - `providers.ts`: `contextWindow(provider, model)`, for the catalog's budget.
  - `archive.ts`: `HEAD` by `info/refs`, and the streamed tar reader, shared later with [plugins](plugins.md).
  - `registry.ts`: the skills.sh search and fxbot's skills list, beside the MCP sources.
  - `skills-registry.json`: fxbot's skills list, which the website build also publishes.
  - `index.ts`: the add-on calls pass by kind, `instructionsFor` adds the catalog, and the tool joins `chat_history`.
  - `migrations/0004_skills.sql`.
- **`packages/server`:** the file route, `kind` on search, and `FXBOT_LISTS_URL`.
- **`packages/ui`:** `skills.tsx` for the Skills tab's cards, the skill page, and its settings; `addons.tsx` for the tab, the rows, and the bots control both kinds share; and `steps.tsx` for the chat's sentence.
- **Dependency:** `yaml`, pinned exactly.

### Security

- **Skill text is untrusted instructions,** like a tool result. It is pinned to a commit, shown before it's added, capped, and confirmed again when it changes.
- **Nothing in a skill runs.** Scripts are text to read, and a skill can't add tools: as eve puts it, "Loading a skill adds instructions, never tools".
- **The page shows skill text as plain text,** never HTML.
- **Requests the server makes:** skills.sh for each search, which sends it the words, fxbot's site for its lists, and `github.com` and `codeload.github.com` for a skill's repository, over HTTPS only.

### Size

Planned at about 500 lines. Built in about 900, nearly twice the plan: the tool's parts and closest names, the update check's pass per repository, and the settings' Update view each took more than planned. Naming a skill in a message came after, at about 190 more: `skill-picker.tsx` (150) and about 40 in the SDK, the route, and the chat.

| Part | Planned | Built |
| --- | --- | --- |
| `skills.ts`: records, parsing, the catalog, the tool, previews, and updates | about 190 | 360 |
| `archive.ts`: `info/refs` and the tar reader | about 70 | 127 |
| `registry.ts`: skills.sh and fxbot's skills list | about 50 | about 70 |
| The migration, routes, types, client, and the SDK's wiring | about 40 | about 80 |
| UI: the Skills tab, the page, the row and settings, and the chat sentence | about 150 | about 300 |

Plus the `yaml` dependency.

## 4. Checklist

All checked on 2026-11-02: 41 checks in the SDK and 21 in a browser, then the add-ons phase's 37 and 34 and the MCP phase's 67 again. Checks use the mock model, disposable Postgres, and mocks in the scratchpad: a GitHub that answers `info/refs` and serves archives, a skills.sh search, and a published fxbot site. Nothing reaches the live sources except the human's check. Before the checks, the pages of fxbot's three skills, `grill-me`, and `pdf` were opened once against GitHub, and skills.sh was searched once, read-only.

**M1. Records**
- [x] An archive with three skills: each one's page finds it by name, or by folder. A skill with no `name`, or a `description` past 1024 characters, says why, and has no Add.
- [x] A binary file is skipped and listed, and a 300 KiB file is refused.
- [x] A folded or quoted `description` parses whole.
- [x] A link, or a path that leaves the repository, is never read. Nothing from the archive is written to disk.

**M2. Catalog and tool**
- [x] A bot's instructions list only its skills. A bot with none gets no catalog, and with no skills installed, agents have no `skill` tool.
- [x] With 60 skills and a small context window, every name stays and descriptions stop at the budget. `skill({ search })` finds the rest.
- [x] `skill({ name })` returns libfx's rendering of the skill, with its files listed, and `file` returns one file.
- [x] A skill that's off for the bot is refused, and an unknown name gets the closest names.
- [x] A scripted mock model calls `skill`, and its next request carries the skill's text.
- [x] A `$name` in a message, or `/name` at its start, sends that skill along as a resource, with no tool call. A `$` that names no skill, a `/name` past the start, and a skill off for the bot send nothing. The chat shows the message as typed.

**M3. Sources and updates**
- [x] A skills search asks skills.sh once after typing stops, and caches for 5 minutes.
- [x] fxbot's skills list leads, tagged fxbot, as shipped and then as published. A skill on both shows once, as fxbot's, and installs from the same repository the same way.
- [x] `FXBOT_LISTS_URL` reads both lists from one site.
- [x] Add saves the commit the page showed, and refuses when `HEAD` moved and the skill changed in between.
- [x] A moved `HEAD` marks the add-on only when its skill's files changed. Update shows what changed, and moves only after Update.

**M4. UI and docs**
- [x] Playwright: see fxbot's skills on the Skills tab, search for one on skills.sh, open its page, read its `SKILL.md`, add it, find it under Installed, and give it to one bot. A chat shows "Read a skill". Update a marked skill. At phone width too.
- [x] Playwright: in a chat, `$al` lists the bot's alpha, Enter makes it a chip, and sent, the bubble shows the chip and the bot's request carries the skill. "$5" opens nothing, `/` and Escape open and close the list, and a bot without skills says so.
- [x] The add-ons and MCP checks still pass.
- [x] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**The human runs this:** type `$` in a chat and send a skill with a message, then find a skill on the Skills tab, add it, and ask a bot something it covers. The bot should read the skill before it answers.

## 5. Open questions

Each has a default.

1. **The catalog budget.** *Default:* 1% of the context window, as Claude Code uses, or 8,000 characters when the window is unknown, as fx uses.
2. **Switches per skill.** *Default:* none. A skill follows its add-on's switches, and a skills.sh add-on is one skill.
3. **Scripts.** *Default:* readable, never run. Running them would take a code tool, which fxbot doesn't have.
4. **Search on skills.sh.** *Default:* on whenever the Skills tab is open. Each search sends its words to skills.sh. A setting to turn it off can come later.
5. **MCP-served skills.** *Default:* after 0.2.0. The SDK fxbot uses already has the client, but few servers serve skills, and the extension is in Beta.
6. **fxbot's first skills.** *Decided:* show-me, frontend-design, and grilling ([Sources](#sources)).

## Later: skills bots write

This is the first idea of this page: a bot writes down what worked as a skill, small enough to read and audit.
- A bot proposes a skill through a write tool. Its row has the bot as author instead of an add-on.
- The owner reads it and approves it, and then it joins that bot's catalog.

It needs its own plan, and sits close to [memories](memories.md).
