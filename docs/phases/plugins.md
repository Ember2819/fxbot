# Plugins

A plugin bundles [MCP servers](../_completed/phases/mcp.md) and [skills](skills.md) in the format that Cursor, Codex, Grok, and Claude Code share. In fxbot, a plugin can also:
- launch local MCP servers
- install the tooling they need, such as [herdr](https://herdr.dev)
- hook into a bot's turns

Plugins are found and added through [add-ons](addons.md), whose page lists every part before anything is saved. A plugin made only of remote servers and skills runs nothing on this machine. One with local servers, setup, or hooks does, and the first plugin, herdr, has all three, so most of this page is about doing that safely.

Status: planned, not built. Research and plan only. It builds on [add-ons](addons.md), [MCP servers](../_completed/phases/mcp.md), and [skills](skills.md), and shares one hook seam with [permissions](permissions.md). Its first plugin is herdr ([fxbot's extension](#fxbots-extension)).

## 1. Research

These are read from specs, source, docs, and the installed libfx, as of November 2026. Paths are relative to each repository.

**Plugin formats**
- **Agent Plugins 1.0.0** ([site](https://agent-plugins.org/); `agentplugins/agent-plugins-spec` at `ff8ab5e`, `spec/1.0.0.md`). It is "the current published release", and 1.1.0 is a working draft.
  - **Manifest.** A root `plugin.json` with `$schema` and `name`. Its schema is closed. A client's own data goes under `extensions`, keyed by a reverse-domain namespace, and its files go in a top-level folder of that name.
  - **Parts.** It defines "exactly two component types: **skills** and **MCP servers**", at fixed locations.
    - Skills are `skills/<name>/SKILL.md`, and clients "MUST NOT recursively search deeper".
    - MCP servers are in `mcp.json`, as `stdio`, `streamable-http`, or `sse` entries.
    - Commands, hooks, agents, rules, and LSP servers "remain too client-specific", and clients "MUST ignore component types they do not support".
  - **Local servers.** A stdio `command` is "a single executable token, not a shell command string".
    - Clients set `PLUGIN_ROOT` and `PLUGIN_DATA`, and keep `PLUGIN_DATA` across updates.
    - Only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded, in `args`, `env`, and `cwd`: "Clients MUST NOT perform any other placeholder or environment-variable expansion".
  - **Secrets and sign-in.** Plugins "MUST NOT embed credentials or other secrets" in `env` or headers. The spec "defines no OAuth configuration": sign-in is the client's job.
- **Who reads what.**
  - Codex: the root `plugin.json` is "the portable entry point", `.codex-plugin/plugin.json` is "a compatibility fallback", and Claude-compatible manifests and `.claude-plugin/marketplace.json` are read too ([Codex](https://developers.openai.com/plugins/build/plugins)).
  - Cursor: a root `plugin.json` or `.cursor-plugin/plugin.json` ([Cursor](https://cursor.com/docs/plugins)). Grok Bot's apps come from Cursor's catalog ([add-ons](addons.md#1-research)).
  - Grok Build looks for `plugin.json`, `.grok-plugin/plugin.json`, and `.claude-plugin/plugin.json` (`xai-org/grok-build`, `crates/codegen/xai-grok-agent/src/plugins/manifest.rs`).
  - Claude Code keeps `.claude-plugin/plugin.json`, and so does Anthropic's marketplace. 192 of its 315 plugins hold only MCP servers and skills ([add-ons](addons.md#1-research)).
- **Twilio's plugin** (`twilio/ai`, at the marketplace's pin `8aba46f`).
  - Its `.claude-plugin/plugin.json` lists `"skills": ["./skills/twilio", "./skills/sendgrid"]`, and an inline server, `{ "type": "http", "url": "https://mcp.twilio.com/docs" }`, which needs no sign-in (`mcp/README.md`).
  - Its 57 skills sit two levels down, so Agent Plugins' strict discovery would miss them. Later commits add Codex and Cursor manifests.

**Claude Code plugins** ([manifest](https://code.claude.com/docs/en/plugins/manifest-reference), [components](https://code.claude.com/docs/en/plugins/components), [hooks](https://code.claude.com/docs/en/hooks), [security](https://code.claude.com/docs/en/plugins/security))
- **Layout.** Its manifest, `.claude-plugin/plugin.json`, is optional, and requires a `name` when present. The standard layout is:
  - `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, and `bin/`
- **MCP servers.** stdio servers look like `{"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/server.js"], "env": {…}}`.
  - `${CLAUDE_PLUGIN_DATA}` is kept across plugin updates.
  - A `userConfig` option marked `sensitive` is masked, and kept in secure storage instead of `settings.json`.
- **Hooks.** Each of 33 events (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart, and more) maps to `[{matcher, hooks: [{type: "command", command, timeout}]}]`. Exit code 2 blocks where the event allows it, and JSON output can return `permissionDecision`, `updatedInput`, or `additionalContext`.
- **Trust.** A plugin "can execute arbitrary code on your machine with your user privileges", and Claude Code runs its hooks and MCP servers "outside the sandbox".
  - Before install, a **Will install** list shows the commands, agents, skills, hooks, and MCP and LSP servers it adds.
  - Plugins from npm are fetched with `npm pack --ignore-scripts` and checked against their integrity, so install scripts never run ([changelog](https://code.claude.com/docs/en/changelog)). Without a `version`, the commit SHA is the version.

**opencode v2** (`packages/plugin/src/README.md`, `packages/core/src/mcp/stdio.ts`)
- **Plugins run in the host's process.** `Plugin.define({ id, setup(ctx) })` grants plugins "the same two in-process capabilities" as the host.
- **Hooks.** Transforms: agent, command, integration, mcp, model, provider, skill, tool, and websearch. At runtime: `tool` execute before and after, `session` context and model requests, `permission.evaluate`, `shell` create, and `event.subscribe`.
- **MCP.** Local servers are `{command[], cwd, environment}` and inherit the whole host environment (`extendEnv: true`). Remote servers are `{url, headers, oauth}`.
- **Installs** run with `ignoreScripts: true`. The Figma plugin is a remote MCP server plus skills (`packages/plugins/figma/index.ts`).

**eve** (`docs/extensions/index.md`, `docs/install-integrations.mdx`, `docs/guides/hooks.md`)
- **Extensions.** An extension is an npm package exporting `defineExtension({ config })`. It can add tools, channels, connections, skills, schedules, subagents, instructions, and hooks, with names prefixed (`crm__`).
- **Install.** `/add` asks whether to "skip those packages, allow their build scripts, or abort", and says to "Never pass a secret in `--answer`".
- **Hooks** run "after the agent records an event". They can cancel or continue, but "can't add text to the model's context".

**libfx 0.0.16 and the fx CLI** (installed package; `vercel-labs/fx`)
- **Tools.** A host tool is `{ name, description, inputSchema, idempotent, execute(input, { signal, sessionId, context }) }`. Authorization happens "inside `execute`".
  - The tool list is fixed when an agent is made.
- **MCP.** `libfx/mcp` adapts a client that fxbot owns ([mcp.md](../_completed/phases/mcp.md#1-research)). fxbot starts and stops local server processes itself.
- **Hooks.** `hooks.onEvent` reports turn, step, model, tool, permission, and MCP events. "libfx doesn't await their promises", so hooks there can only observe.
- **The fx CLI.**
  - `fx mcp add NAME -- CMD` adds a stdio server, and a project's servers wait for `fx mcp approve` (`src/core/mcp_host/verbs.zig`).
  - Each server gets its own process group, "so a wrapper (npx, uvx, a shell) and the server it starts stop together" (`src/mcp/io/process.zig`).
  - Its hooks are internal, including a herdr reporter (`src/builtins/hooks/herdr.zig`).

**herdr** ([herdr.dev](https://herdr.dev), [repo](https://github.com/herdrdev/herdr), [socket API](https://herdr.dev/docs/socket-api))
- **What it is.** A Rust "runtime your coding agents live on" (its README). It owns their terminals and reaches other machines over SSH.
- **Install.** `curl -fsSL https://herdr.dev/install.sh | sh`, `brew install herdr`, `mise use -g herdr`, or release binaries.
  - herdr.dev now presents "a native app for running coding agents", which agents drive with an `hc` CLI (`hc run`, `hc send`).
- **Control.** A newline-delimited JSON socket at `~/.config/herdr/herdr.sock`, with commands such as `pane.send_keys` and `agent.prompt`. No auth is documented.
- **MCP.** herdr ships no MCP server. A third-party one, `aelaguiz/herdr-mcp`, is stdio, run with `uvx --from git+https://github.com/aelaguiz/herdr-mcp herdr-mcp`. It needs `herdr` on the PATH, talks to whatever session "the `herdr` CLI resolves from the environment", and says "No auth, no sandbox".
- **A herdr skill** installs with `npx skills add herdrdev/herdr --skill herdr -g` ([agent skill](https://herdr.dev/docs/agent-skill/)).

**Running local servers safely**
- **The MCP spec** ([security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)).
  - Before a local server runs, clients MUST "Show the exact command that will be executed, without truncation" and get explicit approval. They SHOULD flag `sudo` and `rm -rf`, and run servers sandboxed with minimal privileges.
  - Its section on stdio proxies fits fxbot, a server that starts processes for a web page. Script injected into the page could have it run commands, so the spec recommends a Content Security Policy, sandboxed processes, and extra authorization for dangerous commands.
- **The SDK's stdio transport** (read in `@modelcontextprotocol/sdk` 1.32.2). It spawns with `shell: false`, passes only `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, and `USER` plus the declared environment, and stops only its direct child. It has no process-group option.
- **Pinning.** `npx -y pkg@x.y.z`, `uvx --from git+…@<sha>`, `docker run --rm img@sha256:…`, and `.mcpb` bundles with `fileSha256`.
- **Isolation in the references.**
  - durable-harness refuses environment variables with credential-like names or values (`packages/harness-sandbox/src/env-check.ts`), and checks its pinned CLIs by sha512 (`packages/harness-sandbox/src/base.ts`). In its VM, commands run with a minimal environment "as an unprivileged user with no sudo" (`packages/sandbox-host/src/local-sandbox.ts`).
  - agent-browser's plugins "remain trusted local executables" (`README.md`).
  - OpenDots approval "runs the stored request, never arguments sent with the approval" (`docs/CONNECTIONS.md`).
- **fxbot itself.** The server holds the database URL and the secret key file. A child process running as the same OS user can read that key file, whatever its environment ([provider logins](../_completed/phases/provider-logins.md)).

## 2. Key takeaways

1. **Read the shared format; don't invent one.** Its two portable parts, MCP servers and skills, are exactly what fxbot runs.
   - fxbot reads Agent Plugins (`plugin.json`, `mcp.json`, and `skills/`), and Claude's layout (`.claude-plugin/plugin.json`), which Anthropic's marketplace uses.
   - Other parts are counted on the add-on page as not used.
2. **fxbot's extras go in the format's extension slot,** under fxbot's namespace in `extensions`, and in a folder of that name:
   - required binaries and their setup
   - settings for secrets
   - read-only hints
   - hooks
3. **Code runs here only for local parts.** A plugin of remote servers and skills needs none of the rules below. Local servers, setup steps, and hooks do.
4. **Local code runs as the agents' OS user, never as fxbot's own.** fxbot's user can read the secret key and reach Postgres. The plugin is pinned, and everything it runs is shown before it runs.
5. **Keep plugins out of fxbot's process.** Hooks are commands that read and write JSON, not JavaScript loaded into the server. opencode and eve load plugin code in-process, but fxbot's process holds the keys to everything.
6. **Hooks go only where real seams exist:**
   - `tool.before` and `tool.after` in fxbot's wrapper around every tool's `execute()`. That is libfx's only blocking point, and the same seam [permissions](permissions.md) needs, so it is built once.
   - `turn.start` and `turn.end` from libfx's `hooks.onEvent`. These only observe.
   - Prompt, context, and model transforms wait, because libfx has no seam for them.
7. **Install only fetches files.** No package scripts run. Setup steps, like installing herdr, run only when the owner clicks, and never with sudo.
8. **Supervise local MCP processes carefully:**
   - `shell: false`
   - only the declared environment
   - their own process group
   - restarts with capped backoff
   - recent stderr shown in the UI
9. **The first plugin is herdr,** which the owner already uses. It checks for the binary, installs it on request, and runs a pinned herdr-mcp.

## 3. Implementation

### The format

`plugins.ts` reads a plugin from its pinned archive, in this order:
- **Manifest.** The root `plugin.json` when its `$schema` is Agent Plugins'. Otherwise `.claude-plugin/plugin.json`. Otherwise none, and the name comes from the marketplace entry or the folder.
- **MCP servers.**
  - Agent Plugins: `mcp.json`.
  - Claude: the manifest's `mcpServers` (inline, or a path), otherwise `.mcp.json`. Claude's `"type": "http"` means `streamable-http`, and an entry with a `command` is stdio.
  - Remote servers go through the [MCP flow](../_completed/phases/mcp.md#adding-a-server), sign-in included. Local ones run as described under Running.
- **Skills.** `skills/<name>/SKILL.md`, plus each folder that the manifest or the marketplace entry lists in `skills`. A listed folder is a skill, or holds skills one level down, like Twilio's `./skills/twilio`. They load as [skills](skills.md#adding-skills) do.
- **Placeholders.** `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, and Claude's `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`, are expanded in `args`, `env`, and `cwd`. Nothing else is.
- **Not used by fxbot.** Commands, agents, LSP servers, monitors, `bin/`, and other clients' hooks are counted on the add-on page.
- **Registry packages.** A registry `packages` entry becomes a one-server plugin.
  - npm becomes `npx -y <package>@<version>`, and PyPI becomes `uvx <package>==<version>`.
  - Its `environmentVariables` move into fxbot's extension.
  - Other package types are shown, but can't be added yet.

### fxbot's extension

The herdr plugin, fxbot's first plugin, published in the project's marketplace ([add-ons, question 2](addons.md#5-open-questions)):

```text
herdr/
├── plugin.json
├── mcp.json
├── skills/herdr/SKILL.md
└── <namespace>/hooks/report.js
```

`plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "herdr",
  "version": "0.1.0",
  "description": "Drive herdr agents and panes from a bot",
  "homepage": "https://herdr.dev",
  "extensions": {
    "<namespace>": {
      "requires": [
        { "bin": "herdr", "check": ["herdr", "--version"], "install": ["sh", "-c", "curl -fsSL https://herdr.dev/install.sh | sh"] },
        { "bin": "uvx", "check": ["uvx", "--version"] }
      ],
      "readOnly": { "herdr": ["list_agents", "read_pane"] },
      "hooks": { "turn.end": [{ "command": ["node", "./<namespace>/hooks/report.js"] }] }
    }
  }
}
```

`mcp.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "herdr": {
      "type": "stdio",
      "command": "uvx",
      "args": ["--from", "git+https://github.com/aelaguiz/herdr-mcp@<commit>", "herdr-mcp"]
    }
  }
}
```

herdr-mcp talks to whatever session the `herdr` CLI finds. By default that is the socket in the plugin user's home, so it needs no settings. The extension's fields:
- **`requires`.** Each binary's `check` runs on its own. An `install` runs only when the owner clicks.
- **`environmentVariables`.** Per server, in server.json's shape: `name`, `description`, `isRequired`, `isSecret`, and `default`.
  - Agent Plugins allows no secrets in `env` and no other placeholders, so settings live here.
  - The add-on asks for them, seals the secret ones, and passes them only to that server.
- **`readOnly`.** Per server, the tools that count as read-only, and so are allowed until the owner picks ([mcp.md](../_completed/phases/mcp.md#built)), when the server doesn't mark them itself.
- **`hooks`.** The events are `tool.before`, `tool.after`, `turn.start`, and `turn.end`.
  - Each event takes commands as argv arrays, with an optional tool-name `match`.
  - Hook scripts live in the namespace's folder.
- **The namespace** is a reverse-domain name on a domain the project controls ([question 7](#5-open-questions)).

### Installing

1. **A source.** Sources are listed in [add-ons](addons.md#sources-packagessdksrcregistryts):
   - a marketplace entry, pinned by `sha`, or by the marketplace's own commit
   - a registry `packages` entry
   - a git URL pinned to a commit
   - Local parts from an unreviewed source can't run without `FXBOT_UNREVIEWED_PLUGINS=1` in the server's environment. Unreviewed means a URL, an added marketplace, or the official registry. Remote servers and skills from it still work, with consent ([question 2](#5-open-questions)).
2. **Fetch.** `archive.ts` downloads the pinned archive, shared with [skills](skills.md#adding-skills).
   - An npm source is the registry's tarball, checked against its `integrity`.
   - Nothing is executed: no `npm install` scripts, and no build.
   - Only a plugin with local parts is unpacked, to `FXBOT_DATA/plugins/<id>/<version>/`, with regular files only, no links, and every path inside.
3. **Validate.**
   - Commands are argv tokens, with no shell strings outside an explicit `sh -c`.
   - Paths stay inside the plugin.
   - Each bad server or skill is skipped and reported, as Agent Plugins requires.
4. **The add-on page** lists every part ([add-ons](addons.md#the-add-on-page)):
   - every command and argument, untruncated
   - environment variable names
   - URLs
   - secrets requested
   - hooks
   - setup steps
   - It flags `sh -c`, `curl … | sh`, `sudo`, and network installers. Add records the definition's hash.
5. **Settings form.** The `environmentVariables`. Secret fields are write-only and sealed.
6. **Checks.** Each `requires.check` runs. A missing binary shows its `install` step behind a **Run setup** button.
   - The output streams to the page, and the step runs as the plugin user.
   - If the step needs root, fxbot shows the command for the owner to run instead.
7. **Enable.** Local servers start, remote ones connect, skills join the catalogs, and tools join the agents ([add-ons: bots](addons.md#bots-and-add-ons)).

### Running (`packages/sdk/src/plugins.ts`)

- **Files.** A plugin's files are owned by `fxbot` and read-only to everyone else, so the files that run are the approved ones.
  - `FXBOT_DATA` itself is traverse-only, and its session files stay private to `fxbot`.
  - `PLUGIN_ROOT` is the unpacked folder. `PLUGIN_DATA` is `~/.local/share/fxbot/<id>/` in the plugin user's home, which is also the working directory, and survives updates.
- **The OS user.** Processes run as the agents' OS user, through `sudo -n -u <FXBOT_PLUGIN_USER> -- env -i <env> <command>`. That needs one sudoers rule that lets the `fxbot` user run commands as that user.
  - The plugin user cannot read the key file or the session files, or reach Postgres.
  - Without `FXBOT_PLUGIN_USER`, local processes don't start ([question 1](#5-open-questions)).
- **Processes.**
  - `plugins.ts` spawns each local MCP server itself, with `shell: false` and in a new process group, and hands its pipes to the MCP client through a small stdio transport. The SDK's own transport can't start a group.
  - The environment is that user's `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, and `USER`, plus `PLUGIN_ROOT`, `PLUGIN_DATA`, the declared `env`, and the settings. No `FXBOT_*` or `PG*` variables are passed.
  - fxbot can't signal another user's processes. To stop a server, it closes stdin, then signals the server's process group as the plugin user (`sudo -n -u <user> -- kill`), TERM first and KILL later. That also stops the server behind a wrapper such as npx or uvx.
- **Supervision.** A crashed server restarts with backoff: 1, 2, 4… up to 60 seconds. It gives up after 5 failures in 10 minutes. The last 50 lines of stderr show on the add-on.
- **Hooks.**
  - Each hook is run as `argv` with JSON on stdin, for example `{ event, bot, tool, input }`, with a 10-second timeout, as the plugin user.
  - `tool.before` may answer `{ "decision": "deny", "reason": "…" }`, and the tool call fails with that reason. Exit code 2 does the same.
  - `tool.after` and the turn hooks only observe, and run without blocking the turn.
- **Removal.** Removing a plugin stops its processes, and deletes its files, skills, and secrets. Tooling that a setup step installed stays, and the page says so.

### API, SDK, and client

Adding a plugin goes through the [add-ons](addons.md#api-sdk-and-client) preview and Add. These routes are the plugin's own:

| Route | SDK call |
| --- | --- |
| `PUT /api/addons/:id/settings` | `plugins.configure(id, settings)`: secrets write-only |
| `POST /api/addons/:id/setup/:step` | `plugins.setup(id, step)`: runs a manifest step by index, never a command from the page |
| `GET /api/addons/:id/logs` | `plugins.logs(id)`: recent stderr and setup output |

### Where the code goes

- **`packages/sdk`:** `plugins.ts` (reading the format, the extension, processes, and hooks). It uses `archive.ts` and `skills.ts` from [skills](skills.md), and `mcp.ts`. `registry.ts` gains the marketplace sync described in [add-ons](addons.md#sources-packagessdksrcregistryts).
- **`packages/server`:** the routes above.
- **`packages/ui`:** the settings form, setup output, and process status and logs. The add-on page is in [add-ons](addons.md#ui).

### Security

- **A plugin runs as the plugin user,** which cannot read fxbot's key, its session files, or Postgres (peer auth admits only `fxbot`). An agent running as root can still read everything, as [provider logins](../_completed/phases/provider-logins.md#security) says.
- **The page never sends a command.** The API takes references, approved hashes, and setup step numbers, so only commands from a fetched, pinned plugin can run.
- **Script in the page is the risk** that the MCP spec's proxy section describes. Approval is an API call, so injected script could approve a plugin just as the owner can. Three things limit that:
  - The page renders no untrusted HTML. Registry text, tool results, skills, and replies show as text or sanitized markdown.
  - Local parts from unreviewed sources need `FXBOT_UNREVIEWED_PLUGINS=1`, which only the server's environment can set ([question 2](#5-open-questions)).
  - Plugin code runs as the plugin user.
- **The approved files are the files that run.** fxbot pins and verifies the fetch, runs no install scripts, asks again on any change, and never updates on its own.
- **Secrets are sealed,** and reach only the server that declared them, through its environment.
- **A plugin's tools are untrusted** like any MCP tool. Only their read-only ones are allowed until the owner picks ([mcp.md](../_completed/phases/mcp.md#tools-for-bots)), and the [permissions](permissions.md) phase adds asking.
- **herdr in particular.** Its socket has no auth, so a bot with herdr tools can type into any herdr pane. The herdr plugin starts read-only, with only `list_agents` and `read_pane`.

### Size

About 620 lines, the largest add-on phase:

| Part | Lines |
| --- | --- |
| `plugins.ts` | about 380 |
| Routes | about 40 |
| Client | about 20 |
| UI | about 180 |

The process and hook code is where most of the risk is, and should not be trimmed.

## 4. Checklist

Checks use plugin repos and a marketplace in the scratchpad, a tiny stdio MCP server, disposable Postgres, and a plugin OS user created for the checks. Nothing installs real tooling except the human's herdr check.

**M1. Format and install**
- [ ] The herdr plugin, with a stub `herdr` and a tiny stdio server in place of herdr-mcp: its server, skill, setup steps, and hook all show on the add-on page, with `curl … | sh` flagged.
- [ ] The mock marketplace syncs at its commit, and its plugins join the add-on search. An entry without a pin shows, but can't be added.
- [ ] A Claude-format plugin (listed skill folders, an inline `http` server) installs with all its skills. It needs no plugin user, and nothing is unpacked to disk.
- [ ] Commands, agents, and an LSP server are counted as not used. A bad server or skill is skipped and reported.
- [ ] A changed commit, integrity, or sha256 is refused. No package script runs (checked with a package whose `postinstall` writes a marker file).
- [ ] Changing the plugin asks again, and nothing updates on its own.
- [ ] Without `FXBOT_UNREVIEWED_PLUGINS`, a plugin from a URL keeps its remote server and skills, but its local server, setup, and hooks are refused by the API, whatever the page sends.

**M2. Processes**
- [ ] A local MCP server starts as `FXBOT_PLUGIN_USER` (`ps -o user`), with `PLUGIN_ROOT` and `PLUGIN_DATA` set. Its environment has none of `FXBOT_*` or `PG*`, and it cannot read the key file or the session files.
- [ ] Without `FXBOT_PLUGIN_USER`, nothing starts, and the page says why.
- [ ] Killing the server restarts it with backoff, and five crashes stop it with the stderr shown.
- [ ] Stopping a server started through a wrapper (`sh -c`, or a node wrapper) leaves no child running.

**M3. Hooks and settings**
- [ ] A `tool.before` hook that denies fails the call with its reason, and the bot sees the reason.
- [ ] A hook that times out does not hang the turn.
- [ ] `turn.end` runs after a reply, with the bot and message ids.
- [ ] A secret setting reaches only its server's environment, and is never returned to the page.

**M4. Setup, UI, and docs**
- [ ] A `requires` check finds a missing binary. **Run setup** runs the manifest's step and streams its output. A step needing root shows the command instead.
- [ ] Playwright: the add-on page, settings with a secret, setup output, status, logs, a per-bot switch, and removal.
- [ ] Registry text and a tool result holding `<img src=x onerror=alert(1)>` render as text.
- [ ] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**The human runs these:**
- Create the plugin user and its sudoers rule. Keep `FXBOT_DATA` outside any private home directory, so that user can reach `plugins/`.
- Publish the project's marketplace with the herdr plugin.
- Add the herdr plugin on the real machine, run its setup if herdr is missing, and list agents from a bot.
- Decide whether to allow herdr's write tools.

## 5. Open questions

Each has a default.

1. **The OS user for plugins.** *Default:* required. Local processes and hooks run only as `FXBOT_PLUGIN_USER`, and without it fxbot refuses them. The alternative is running as `fxbot`'s own user with a warning, which gives plugins the secret key.
2. **Unreviewed sources.** *Default:* the project's marketplace, Anthropic's marketplace, and GitHub's registry count as curated. Local parts from anywhere else need `FXBOT_UNREVIEWED_PLUGINS=1` in the server's environment, so script in the page cannot turn them on.
3. **Setup steps.** *Default:* run on click as the plugin user, never with sudo. Root-level installs (`apt`, a system-wide `brew`) are shown as commands for the owner to run.
4. **The hook set.** *Default:* `tool.before`, `tool.after`, `turn.start`, and `turn.end`. Context and model transforms wait for a libfx seam.
5. **Claude Code's hooks.** *Default:* not run. They expect Claude Code's tools and events, so they're counted as not used.
6. **Which herdr.** The herdr TUI, or the newer app with `hc`? *Default:* the TUI and its socket, with the third-party herdr-mcp pinned to a commit. The owner confirms.
7. **fxbot's namespace.** *Default:* a reverse-domain name on the project's public site, chosen with the [CIMD document's](../_completed/phases/mcp.md#5-open-questions) home.
8. **Updates.** *Default:* none on their own. A newer pin shows Update, which goes through the add-on page again.
