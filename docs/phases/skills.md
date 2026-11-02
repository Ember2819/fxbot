# Skills

Bots use skills: [Agent Skills](https://agentskills.io/specification), folders with a `SKILL.md`. Skills come from [add-ons](addons.md): a skill found on skills.sh, the skills inside a [plugin](plugins.md), or the skills an [MCP server](../_completed/phases/mcp.md) serves. Each bot sees a short list of its skills, and reads one only when a task needs it.

This page's first idea was that profiles grow skills from use, kept small enough to read and audit. That comes later and builds on the same records and tool ([Later](#later-skills-bots-write)).

Status: planned, not built. Research and plan only. It lands after [add-ons](addons.md), whose records and search it uses, and skills served by MCP servers need [MCP servers](../_completed/phases/mcp.md) too. It lands before [plugins](plugins.md), whose skills it loads.

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

**libfx 0.0.16** (`libfx/skills`, read in the installed package)
- `createSkillsAdapter(records)` puts every skill's full text and resources into one instructions string, and throws past 64 skills or 64 KiB. Nothing loads on demand.
- `loadSkillFile()` "reads one `SKILL.md` and nothing it references". Its frontmatter parser splits each line at the first colon, so a folded `description: >` reads as `>`.

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
  - Checked here: `q=twilio` answered `{ query, searchType: "fuzzy", skills: [{ id, source, skillId, name, installs }], count }`. Results carry no descriptions.
  - The documented `/api/v1/` needs a Vercel OIDC token ([API](https://skills.sh/docs/api)).
- **Repositories.** `npx skills add owner/repo --skill name` looks in the usual places, then walks the tree up to 5 levels deep (`src/skills.ts`). The usual places are:
  - the root
  - `skills/`
  - dozens of agent folders, such as `.agents/skills` and `.claude/skills`
  - the paths a Claude plugin manifest lists (`src/plugin-manifest.ts`)
- **Plugins.** The shared Agent Plugins format has "exactly two component types: skills and MCP servers", with skills at `skills/<name>/SKILL.md` ([plugins](plugins.md#1-research)).
  - Twilio's plugin holds 57 skills, from 4 KB to 37 KB each and 632 KB in all (`twilio/ai`, counted here).
- **MCP servers.** The `io.modelcontextprotocol/skills` extension (SEP-2640, at the Beta stage) lets a server serve skills ([overview](https://modelcontextprotocol.io/extensions/skills/overview)).
  - A server that declares it "MUST implement `skills/list` and `skills/get`", and serves each file through `resources/read`, conventionally under `skill://`.
  - The TypeScript SDK ships it in v2.4.0. A community list names Hugging Face, Cloudflare's API server, Outline, and n8n among the servers that serve skills (`docs/implementations.md`).
  - Hosts "MUST treat MCP-served skill content as untrusted model input", "MUST tag MCP-served skill content with its originating server identity", and "MUST resolve skill names within a per-origin namespace". No skill may run code without "explicit per-skill user approval" (`specification/beta/skills.mdx`).

## 2. Key takeaways

1. **Load skills on demand.** Every reference lists names and descriptions, and reads a skill's text only when a task needs it. libfx's adapter puts everything into the instructions and stops at 64 skills or 64 KiB, and Twilio's 57 skills alone are 632 KB, so fxbot doesn't use it.
2. **One tool reads them.** `skill` is a host tool on every agent, like `chat_history`. libfx fixes tools per agent, so the tool checks `context.bot` and serves only that bot's skills.
3. **Each bot's catalog has a budget.**
   - It joins the bot's instructions per session, which libfx allows.
   - Every name is listed. Descriptions fill up to 1% of the model's context window, or 8,000 characters when the window is unknown. The tool's search finds the rest.
4. **One library, switched per bot,** as in Grok Bot. An add-on's skills follow the add-on's per-bot switch ([add-ons](addons.md#bots-and-add-ons)).
5. **Skills are text in Postgres.** fxbot keeps `SKILL.md` and the other text files in the skill's folder. Bots have no shell, so a bot can read `scripts/` but they never run.
6. **Skills from an MCP server stay with that server.** fxbot lists them with the server, reads them through it, and labels them with its name, as the extension requires.
7. **A skill is someone else's instructions.** It is pinned, shown in full before it's added, capped in size, and confirmed again when it changes.

## 3. Implementation

### Records (`packages/sdk/src/skills.ts`)

```sql
skills (id text primary key,
        addon_id text not null references addons on delete cascade,
        name text not null, description text not null,
        files jsonb not null default '{}',  -- relative path → text, including SKILL.md
        uri text,                           -- an MCP-served skill's SKILL.md resource; its files stay on the server
        search tsvector generated always as (to_tsvector('simple', name || ' ' || description)) stored,
        unique (addon_id, name))
```

- **Parsing.** Frontmatter is parsed with the `yaml` package, which has no dependencies.
  - `name` and `description` are required, with the spec's limits, and `name` must match the folder.
  - A skill that fails is skipped and reported, and the add-on's other skills still load.
- **Limits.**
  - Text files up to 256 KiB each, and 2 MiB per skill.
  - Binary files, such as icons, are skipped.
- **Names.** A bot sees each skill as `<add-on>:<skill>`, such as `twilio:twilio-call-recordings`. Two add-ons can't collide, and an MCP server's skills carry its label.

### The catalog

`instructionsFor(profile)` adds the bot's catalog after the bot's own instructions:

```text
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, call the skill tool with the skill's name to load its full instructions.
<available_skills>
<skill><name>twilio:twilio-call-recordings</name><description>Record Twilio voice calls correctly…</description></skill>
…
</available_skills>
```

- **What's listed.** Only the skills of add-ons that are on for this bot. A bot with none gets no catalog.
- **The budget.**
  - It is 1% of the model's context window, from the model metadata fxbot already keeps, at 4 characters per token. When the window is unknown, it is 8,000 characters.
  - Every name stays. Descriptions are kept in add-on order until the budget runs out.
  - When any are dropped, the catalog says to search with `skill({ search })`.

### The `skill` tool

| Call | Answer |
| --- | --- |
| `skill({ name })` | The skill's `SKILL.md` body, and a list of its other files |
| `skill({ name, file })` | One of those files, such as `references/verbs.md` |
| `skill({ search })` | Up to 10 of the bot's skills that match, by name and description |

- **Which skills.** It answers only for skills that are on for `context.bot`, and answers an unknown name with the closest names.
  - The guide's enum would change with every add-on and differ for every bot, and libfx fixes a tool's schema per agent.
- **MCP-served skills.** These are read with `resources/read` from their own server. Their text arrives labelled, such as `<skill name="…" from="twilio-docs, an MCP server">`.
- **Registration.** It is `idempotent: true`, since it only reads. It is registered beside `history.tool` only when some add-on has skills, and agents are rebuilt when add-ons change.

### Adding skills

- **From skills.sh** ([add-ons](addons.md#sources-packagessdksrcregistryts)). A result names `owner/repo` and a skill.
  - `archive.ts` pins the repository's current commit (GitHub's commits API) and downloads its archive from `codeload.github.com`.
  - It reads the archive in memory: regular files only, no links, and every path kept inside the skill's folder. Nothing is written to disk.
  - It finds the skill the way `npx skills` does, by its frontmatter name.
- **From a plugin:** its skills are read from the same archive ([plugins](plugins.md#the-format)).
- **From an MCP server** that declares the extension: `skills/list` after connecting, refreshed whenever its tools are.
- **The add-on page** lists each skill's name and description, and opens its full text ([add-ons](addons.md#the-add-on-page)).
- **Updates.** A newer commit shows Update, which asks again. Nothing changes on its own.

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `GET /api/addons/:id/skills` | `skills.list(addon)`: names, descriptions, and sizes |
| `GET /api/addons/:id/skills/:name?file=` | `skills.read(addon, name, file?)`: the text, to read in the page |

Adding, per-bot switches, and removal are the [add-ons](addons.md#api-sdk-and-client) routes.

### UI

- The add-on page's **Skills** section shows each skill's name and description, five at a time with "N more". Each opens its text.
- In a chat, a `skill` call shows as "Read skill twilio:twilio-call-recordings", like other tool calls.

### Where the code goes

- **`packages/sdk`:** `skills.ts` (parsing, records, the catalog, and the tool), `archive.ts` (pinned GitHub archives, shared with [plugins](plugins.md)), the table in `store.ts`, and the tool beside `history.tool` in `index.ts`.
- **`packages/server`:** the routes above.
- **`packages/ui`:** the Skills section and the reader.
- **Dependency:** `yaml`, pinned exactly.

### Security

- **Skill text is untrusted instructions,** like a tool result. It is pinned to a commit, shown before it's added, capped, and confirmed again when it changes.
- **Nothing in a skill runs.** Scripts are text to read, and a skill can't add tools: as eve puts it, "Loading a skill adds instructions, never tools".
- **MCP-served skills keep their server's label** everywhere, never shadow another skill, and are read only from their own server.
- **The page shows skill text** as plain text or sanitized markdown.

### Size

About 350 lines:

| Part | Lines |
| --- | --- |
| `skills.ts` | about 150 |
| `archive.ts` | about 60 |
| Routes | about 20 |
| Client | about 10 |
| UI | about 110 |

Plus the `yaml` dependency.

## 4. Checklist

Checks use the mock model, disposable Postgres, and three mocks in the scratchpad:
- a GitHub archive holding skills
- a skills.sh search
- the [MCP checks'](../_completed/phases/mcp.md#4-checklist) mock server, serving skills through the extension

**M1. Records**
- [ ] An archive with three skills: all three load. A skill with a bad name, or a name that doesn't match its folder, is skipped and reported.
- [ ] A binary icon is skipped, and a 300 KiB file is refused.
- [ ] A folded or quoted `description` parses whole.
- [ ] Nothing from the archive is written to disk.

**M2. Catalog and tool**
- [ ] A bot's instructions list only its skills, each as `<add-on>:<skill>`. A bot with none gets no catalog.
- [ ] With 60 skills and a small context window, every name stays and descriptions stop at the budget. `skill({ search })` finds the rest.
- [ ] `skill({ name })` returns the body and the file list, and `file` returns one file.
- [ ] A skill that's off for the bot is refused, and an unknown name gets the closest names.
- [ ] A scripted mock model calls `skill`, and its next request carries the skill's text.

**M3. Sources**
- [ ] A skills search asks skills.sh once after typing stops, caches for 5 minutes, and asks nothing when turned off. Its results join the add-on search after local entries.
- [ ] A skills.sh result adds its skill from the pinned commit. A newer commit shows Update.
- [ ] An MCP server that declares the extension: its skills are listed after connecting, read through `resources/read`, and labelled with the server.

**M4. UI and docs**
- [ ] Playwright: search for a skill, open its page, read its text, add it, and turn it off for one bot.
- [ ] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**The human runs this:** find a skill through the add-on search, add it, and ask a bot something it covers. The bot should read the skill before it answers.

## 5. Open questions

Each has a default.

1. **The catalog budget.** *Default:* 1% of the context window, as Claude Code uses, or 8,000 characters when the window is unknown, as fx uses.
2. **Switches per skill.** *Default:* none. Skills follow their add-on's per-bot switch. Turning off one skill everywhere can come later.
3. **MCP-served skills.** *Default:* on with their server, and read live from it. They change when the server changes them, like its tools.
4. **Scripts.** *Default:* readable, never run. Running them would take a code tool, which fxbot doesn't have.

## Later: skills bots write

This is the first idea of this page: a bot writes down what worked as a skill, small enough to read and audit.
- A bot proposes a skill through a write tool. Its row has the bot as author instead of an add-on.
- The owner reads it and approves it, and then it joins that bot's catalog.

It needs its own plan, and sits close to [memories](memories.md).
