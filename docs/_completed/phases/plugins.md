# Plugins

A plugin is code that changes fxbot itself, the way [Pi's](https://github.com/earendil-works/pi) extensions change Pi. It runs inside fxbot's server and in its page. Through the plugin API it can:
- hook into a bot's turns and tool calls
- add tools, routes, data, and settings of its own
- add screens, sidebar entries, and controls to the app
- start bots' turns

A plugin can also carry [skills](skills.md) and remote [MCP servers](mcp.md), in the format other agents share. It is found and added through [add-ons](addons.md).

Status: built on 2026-11-03, for 0.4.0. Replanned on 2026-11-02 after the owner asked for plugins that change the app rather than sit beside it, and refreshed on 2026-11-03 for [containers](containers.md) and the project's site, [fxbot.sh](https://fxbot.sh). It builds on [add-ons](addons.md), [skills](skills.md), and [MCP servers](mcp.md). This phase proves the API with two plugins of fxbot's own: [chat rooms](chat-rooms.md) and herdr.

## 0. Core or add-on

**Core: the plugin API.** The API is the seam every other add-on phase plugs into: [chat rooms](chat-rooms.md), [routines](../../phases/routines.md), [triggers](../../phases/triggers.md), [soul](../../phases/soul.md), [permissions](../../phases/permissions.md), and the rest. Chat rooms and herdr are add-ons, and the core never names them ([Core or add-on](../../../CONVENTIONS.md#core-or-plugin)).

## 1. Research

Read from source, docs, and the installed libfx, as of November 2026.

**Pi** (`earendil-works/pi`: `packages/coding-agent/docs/extensions.md` and `docs/packages.md`; read in the scratchpad)
- **What it is.** "A minimal, extensible agent harness that you can make your own." Extensions are "TypeScript modules that extend Pi's behavior", run "inside the Pi process with the same operating-system permissions".
- **Hooks that change things:**
  - `input` can transform a prompt, or handle it without the model.
  - `before_agent_start` can change the system prompt and inject a message.
  - `context` and `context_with_system` can modify the messages of each model request.
  - `tool_call` "can block or mutate input". `tool_result` "can modify the result".
  - `session_before_compact` can cancel or customize compaction.
  - Handlers chain in load order. "Extension errors are logged, agent continues", and "`tool_call` errors block the tool (fail-safe)".
- **What it registers:** tools, commands, shortcuts, flags, providers, MCP servers, and renderers for messages and tool calls (`registerMessageRenderer`, `registerToolRenderer`).
- **Its own UI:** dialogs, widgets, a footer, and replacing the editor (`ctx.ui.custom()`). Pi's UI is a terminal UI.
- **Turns from a plugin:**
  - `pi.sendUserMessage()` and `pi.sendMessage(…, { triggerTurn, deliverAs: "steer" | "followUp" | "nextTurn" })` start or queue turns.
  - `pi.appendEntry()` keeps data in the session that the model never sees.
- **Packages.** A package bundles extensions, skills, prompts, and themes, installed with `pi install npm:…@1.0.0` or `git:…@v1`. Host packages are `peerDependencies`, "do not bundle them". A package can carry its own dependencies.

**opencode** (`packages/plugin` 2.2.5, `packages/core/src/plugin`, `packages/app/src/runtime/plugin`)
- **Plugins load in-process:** `Plugin.define({ id, setup: async (ctx) => cleanup })`. Installs from npm use `ignoreScripts: true`.
- **Reloads.** A changed local file reloads with a cache-busting import URL. If the new revision fails, the previous one is restored. A transform that fails disables its plugin.
- **Transforms** (`ctx.<domain>.transform`): add or change tools, commands, agents, MCP servers, providers, models, skills, and web search.
- **Runtime hooks** mutate their event in place:
  - `tool` `execute.before` can rewrite the input or reject the call. `execute.after` can change the result or the error.
  - `session` `prompt` can change the prompt. `context` can change the system prompt, the messages, and the tools. `compaction` can supply its own result.
- **Plugin state:** `ctx.storage` is a JSON key-value store, kept under `plugin:<id>:`. `ctx.session` can create sessions and prompt them, from a timer or anything else.
- **UI.** The TUI has named slots, such as `sidebar.content`, `session.composer.top`, and `home.footer`, plus pages, dialogs, and panels. The desktop app has registries for commands, panels, settings pages, composer pills, and styles.
- **How it loads UI code.** The server reads the plugin's prebuilt CommonJS bundle. The window runs it with `new Function("require","module","exports", code)`, and that `require` hands over the host's own `solid-js` and client, so plugins share one copy (`src/gui/host.ts:248-251`, `app/src/runtime/plugin/module.ts:11-26`). "The bundle's code is trusted as much as the server that runs the app."

**eve** (`docs/extensions/index.md`, `docs/guides/hooks.md`, `packages/eve/src/discover/discover-agent.ts`)
- **Contributions are folders.** An extension adds tools, channels (HTTP routes), connections, skills, schedules, subagents, instructions, and hooks. It runs in the app's process.
- **Hooks only observe.** "Return values are ignored", and hooks "can't add text to the model's context". Instructions change through `defineDynamic` instead, which runs before every model call.
- **What else it offers:**
  - Tool names take the mount's prefix (`crm__`).
  - State is per session (`defineState`). Extensions get no database, and "may not declare memory".
  - No UI contributions.

**The shared format** (Agent Plugins 1.0.0 at `agentplugins/agent-plugins-spec` `ff8ab5e`; Claude Code's plugin docs; read for the first plan)
- **The manifest.** A root `plugin.json` with a closed schema, which Codex, Cursor, and Grok Build read. A client's own fields go under `extensions`, keyed by a reverse-domain namespace, and its files go in a folder of that name.
- **Its two parts are skills and MCP servers.** Skills are `skills/<name>/SKILL.md`; MCP servers are in `mcp.json`. Clients "MUST ignore component types they do not support".
- **Claude Code** keeps `.claude-plugin/plugin.json`, and runs hooks as shell commands. Its plugins "can execute arbitrary code on your machine with your user privileges".

**libfx 0.0.16** (installed types, `node_modules/libfx/types/libfx.d.cts`)
- **Hooks only observe.** `hooks.onEvent` is "called in event order, but returned promises are not awaited". It reports `turn.*`, `model.*`, `tool.*`, and `mcp.*`.
- **What fxbot itself controls:**
  - the prompt it passes to `session.prompt()`
  - `instructions`, `model`, and `context` per `agent.session()` call, which "apply to the turns this session object starts"
  - every host tool's `execute()`
  - `session.steer()`, which joins a running turn
- **What it doesn't.** No seam rewrites the messages of a model request, as Pi's `context` hook does. A tool list is fixed when an agent is made, and fxbot remakes the agents when tools change (`providers.retool`).
- **Sessions.** An agent opens any number of sessions (`agent.session(id)`, `newSessionId()`). A session runs only on the agent that started it.

**fxbot today** (the places a hook would go)
- `packages/sdk/src/index.ts`:
  - `send()` checks a message, expands named skills, attaches files, and prompts the bot's one session.
  - `open()` builds the instructions: the bot's own, the handoff summary, and the skills catalog.
  - `toolsNow()` lists every tool: `chat_history`, the library's, `skill`, and MCP servers'.
  - `finish()` reads a turn to its end, and records the reply.
- `packages/server/src/index.ts` matches routes by hand, under `/api/<resource>/<id>/<action>`.
- `packages/ui/src/app.tsx`:
  - It picks the screen from `location.pathname`, with one `if` per path.
  - The sidebar has pinned bots, then the bot list, then a footer row: Settings, Library, and Add-ons.
- The page has no content security policy, so `new Function` runs. The service worker precaches the build, and never answers `/api/`.
- Add-ons already have a `kind`, a choice of all bots or each, and per-bot switches (`addons`, `profile_addons`), and the SDK can fetch a pinned GitHub commit (`archive.ts`).

**herdr** ([herdr.dev](https://herdr.dev), [socket API](https://herdr.dev/docs/socket-api), and `herdr api schema --json` from herdr 0.9.3, protocol 22)
- **It is controlled through a socket.** A newline-delimited JSON socket at `~/.config/herdr/herdr.sock`, or `HERDR_SOCKET_PATH`, takes `{"id","method","params"}` and answers `{"id","result"}` or `{"id","error":{"code","message"}}`. No auth is documented; the socket is its user's alone (mode 600).
- **What the plugin needs:** `agent.list` (no params) answers `{"type":"agent_list","agents":[…]}`, each with `pane_id`, `agent`, `name`, `agent_status` (`idle`, `working`, `blocked`, `done`, or `unknown`), and `cwd`. `pane.read` takes `pane_id`, `source` (`visible`, `recent`, `recent_unwrapped`, or `detection`), and `lines`, and answers `{"type":"pane_read","read":{"text","truncated",…}}`.
- **No MCP server of its own.** The third-party `aelaguiz/herdr-mcp` is stdio, run through `uvx`.

**Containers** (since 0.3.0, [containers](containers.md))
- **A release runs in fxbot's container,** as the `fxbot` user. Its data folder, `/var/lib/fxbot/data` on the machine, is a mount that survives updates and goes into the backup before migrations. The image's Node is 22, which runs TypeScript as it is.
- **The container sees no other folder or socket of the machine.** `/opt/fxbot/compose.override.yaml`, which compose merges and fxbot never writes, can mount more. The [agent computer](computer.md) uses it the same way.
- **A checkout runs natively,** as its user, with the database and embedder from `deploy/compose.dev.yaml`.

**fxbot.sh** (live since 0.2.1)
- The site publishes fxbot's own lists, `mcp-registry.json` and `skills-registry.json`, copied from the SDK at build (`packages/website/build.ts`). Since 0.3.0, fxbot reads them from `https://fxbot.sh` by default (`FXBOT_LISTS_URL`).
- The site has the [SDK's pages](https://fxbot.sh/sdk/), for people who build on fxbot, beside the owners' docs.

## 2. Key takeaways

1. **Plugins run in fxbot's process, as in Pi, opencode, and eve.** A server module gets the plugin API; a page bundle gets the app's API. No sandbox and no second process: that is what lets a plugin change the app, and it keeps plugins light. In a release, that process is fxbot's container, so a plugin reaches what the container does, and the owner mounts anything more.
2. **Hooks change things where fxbot's own code runs, and chain in order.** Before a message runs, when instructions are built, before and after every tool call, and after a turn. libfx has no seam inside a model request, so fxbot has no `context` hook: a plugin changes what a bot knows through instructions and messages instead, as eve does.
3. **Load page code the way opencode does.** The server serves the plugin's prebuilt bundle. The page runs it with a `require` that hands over the app's own React, its components, and its client. No import maps, no build step at install, and one copy of React.
4. **Places in the app are named, and few.** Use opencode's slot idea, but only the places the first plugins need: a route, the sidebar, a footer button, the message box, a tool call's view, Settings, and a bot's settings. A new place comes with the plugin that needs it.
5. **Each plugin gets its own Postgres schema,** made by its own migrations and dropped when it is removed. That keeps its data out of core migrations, and it can't collide with core tables or with another plugin.
6. **A plugin starts turns in sessions of its own.** It can make sessions for a bot, prompt them, and read their streams. A plugin's turns run through the same `send()`, with the same hooks and history, and are marked with where they came from.
7. **Keep the shared format.** `plugin.json` is Agent Plugins' manifest, so a plugin's skills and remote servers also work in other agents. fxbot's code parts go under its namespace in `extensions`.
8. **Install only fetches files.** A plugin is pinned to a commit and ships ready to run: plain JavaScript, or TypeScript that Node runs as it is. Nothing is installed or built, and it never updates on its own.

## 3. Implementation

### A plugin

```text
chat-rooms/
├── plugin.json
├── skills/…                     optional, as Agent Plugins has them
├── mcp.json                     optional: remote servers only in this phase
└── fxbot/
    ├── server.ts                its server code
    ├── page.js                  its page code: one CommonJS bundle
    ├── page.css                 optional
    └── migrations/0001_rooms.sql
```

`plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "chat-rooms",
  "version": "0.1.0",
  "description": "Rooms where several bots talk with you",
  "extensions": {
    "sh.fxbot": {
      "server": "./fxbot/server.ts",
      "page": "./fxbot/page.js",
      "css": "./fxbot/page.css",
      "migrations": "./fxbot/migrations",
      "settings": [{ "name": "replyTo", "description": "Who answers a message", "default": "everyone" }]
    }
  }
}
```

- **The name.** The plugin's name is its id in fxbot, `^[a-z0-9]+(-[a-z0-9]+)*$`, up to 40 characters. Its tools are `<name>_<tool>`, as MCP servers' tools take their prefix. Its routes live under `/api/plugins/<name>/`, its page paths under `/<name>/`, and its schema is `plugin_<name>` with `_` for `-`.
- **The namespace** is `sh.fxbot`, the reverse of the project's domain, fxbot.sh ([question 2](#5-open-questions)).
- **The code parts:**
  - `server` is plain JavaScript, or TypeScript that Node 22 strips as it runs, with no other build.
  - `page` is a CommonJS bundle that leaves `react`, `react/jsx-runtime`, and `@fxbot/app` out, for example `esbuild page.tsx --bundle --format=cjs --external:react --external:react/jsx-runtime --external:@fxbot/app`.
  - Other dependencies are bundled in. fxbot installs none ([question 3](#5-open-questions)).

### The server API (`packages/sdk/src/plugins.ts`)

`server.ts` exports one function. fxbot calls it when the plugin loads:

```ts
import type { PluginApi } from "@fxbot/sdk"; // types only: Node erases the import

export default async function setup(fx: PluginApi) {
  fx.on("message", async (e) => { if (e.text === "/ping") return { handled: true }; });
  fx.on("instructions", (e) => { if (e.session === roomSession) e.instructions.push("You are in the Design room."); });
  fx.on("tool.before", (e) => (e.tool === "library_save" && tooBig(e.input) ? { block: "Too big for this bot." } : undefined));
  fx.on("turn.end", async (e) => { await fx.sql`insert into messages ${fx.sql({ room, author: e.bot, text: e.reply })}`; });
  fx.tool({ name: "say", description: "…", inputSchema: {…}, idempotent: false, execute: async (input, { bot, session }) => "…" });
  fx.route("GET", "/rooms/:id", async (req, { id }) => Response.json(await rooms.get(id)));
  return () => clearInterval(timer); // cleanup, when the plugin is removed or updated
}
```

**Hooks** (`fx.on(event, handler)`) run in the order the plugins were added. Each handler sees what the one before it changed:

| Event | When | Gets | Can |
| --- | --- | --- | --- |
| `message` | In `send()`, before skills, files, and the prompt | `bot`, `session`, `text`, `files`, `from` | Change `text` and `files`. Or answer `{ handled: true }`, and no turn runs. |
| `instructions` | In `open()`, each time a session opens | `bot`, `session`, `instructions` (an array) | Add, change, or remove entries |
| `tool.before` | Before every tool's `execute()`: core, MCP, skill, and plugin tools | `bot`, `session`, `tool`, `input` | Change `input`. Or answer `{ block: reason }`, which the model gets as a failed call. |
| `tool.after` | After it | the same, with `result` or `error` | Change `result` |
| `turn.start` | Once libfx accepts the prompt | `bot`, `session`, `messageId`, `text`, `from` | Observe |
| `turn.end` | When `finish()` reads the end | the same, with `reply` | Observe |

- **Plugin hooks and tools apply only to its bots.** That is the add-on's choice of all bots, or each, as for MCP servers and skills.
- **Its page parts are for everyone.**
- **Core tools pass through the same tool hooks.** So do new core features, which use these hooks instead of private ones.

**The rest of `fx`:**
- **`fx.tool(def)`** adds a tool, named `<plugin>_<name>`. Adding the plugin remakes the agents once (`retool`).
- **`fx.route(method, path, handler)`** answers under `/api/plugins/<name>/`, with web `Request` and `Response`. A streamed `Response` body streams to the page. `:name` parts are passed as `params`. The server's own checks come first: a write from another site gets 403, and a body over 12 MiB 413. A handler that throws answers 500 with its message.
- **`fx.sql`** is a `postgres` client whose `search_path` is the plugin's schema, with two connections at most.
- **`fx.settings`** holds its settings, with secrets opened. `fx.on("settings", …)` hears a change.
- **`fx.bots.list()` and `fx.bots.get(id)`** read bots.
- **`fx.chats`** holds sessions and turns ([below](#starting-turns)).
- **`fx.log(…)`** writes to the add-on's log, which shows on its row.
- **`fx.signal`** aborts when the plugin unloads.

### Starting turns

- **`fx.chats.newSession(bot)`** makes a session on the bot's current provider and returns its id. The plugin keeps the id.
- **`fx.chats.send(bot, { text, files?, session?, messageId? })`** runs `send()` with `from` set to the plugin's name.
  - Without `session`, the turn goes to the bot's own chat, whose bubble shows "From chat-rooms". The `from` is saved with the message in `sent`, as a message's files are.
  - With `session`, it goes to the plugin's session. Either way, the hooks, history (so `chat_history` finds it), the library, and `busy` work as they do for the owner's messages.
- **`fx.chats.stream(bot, session, cursor)`** gives that session's lines, like `/api/profiles/:id/stream`. A plugin route can pass them on to its page, where the client's `applyLine` builds the turns.
- **A plugin's session belongs to the provider it started on.** After the bot moves to another provider, `send` to it fails with 409, and the plugin makes a new session.

### Data

- **Schemas and migrations.** Adding a plugin makes the schema `plugin_<name>`, then runs the plugin's `migrations/*.sql` in name order, each in a transaction, with `search_path` set to that schema. The names applied are kept in its `_migrations` table.
- **Updates** run only the new files. A plugin never changes a file that has shipped, as fxbot's own migrations don't.
- **Removing a plugin** drops its schema (`drop schema … cascade`).
- **Core table changes** (core migration `0006_plugins`):
  - add-ons take `kind` `plugin`, with its manifest in `config`
  - `sent` gains `plugin`, the plugin that sent a message, which its `turn_start` line carries as `from`
  - `plugin_sessions` keeps each session a plugin made: its bot, its plugin, and the provider it started on. These sessions stay out of the bot's earlier chats, and a reply in one doesn't change the bot's preview.
  - Plugin settings, secret or not, are sealed together in `addon_secrets`, as MCP servers' header values are

### Settings

- **Declared in `plugin.json`.** Each has `name`, `description`, `default`, `isRequired`, and `isSecret`, in server.json's `environmentVariables` shape.
- **The add-on's page shows a form for them.** Secrets are sealed and write-only, as MCP headers are.
- **Plugin code reads them** through `fx.settings`, on the server only. The page never gets a secret.

### The page API (`packages/ui/src/plugins.tsx`)

- **Loading.** After the bots, the page reads `GET /api/plugins`, which lists each added plugin's name, version, page URL, and CSS URL.
- **Each bundle** is fetched and run with `new Function("require", "module", "exports", code)`, as opencode does.
- **The `require` it gets** returns only:
  - the app's own `react` and `react/jsx-runtime`
  - `@fxbot/app`
  - Anything else throws.
- **Its default export** is called with the app's API, scoped to that plugin.
- **Its CSS** goes in as a `<link>`, and can use the app's CSS variables (`--primary`, `--sidebar`, …). The app's Tailwind build holds only the app's own classes, so a plugin brings its own styles, or uses the app's components.

Every call is optional. This sample makes all of them:

```tsx
const { useState } = require("react");

module.exports = function setup(app) {
  app.route("/rooms/:id", RoomScreen);                          // the page at /<plugin>/rooms/<id>
  app.sidebar(RoomsGroup);                                      // a group in the sidebar, after the bots
  app.nav({ icon: UsersIcon, label: "Rooms", path: "/rooms" }); // a button in the sidebar's footer row; icon: a component
  app.composer(Button);                                         // a control beside the attach button: gets { bot, setDraft, attach }
  app.toolView("say", SayStep);                                 // how a call of <plugin>_say shows in a reply
  app.settings(RoomsSettings);                                  // a section in Settings
  app.botSettings(RoomsForBot);                                 // a section in a bot's settings: gets { bot }
};
```

`@fxbot/app` gives a plugin:
- **`client`:** the app's `@fxbot/sdk/client`, with `applyLine`
- **`api(path, init)`:** fetches the plugin's own routes
- **`go(path)` and `useBots()`**
- **`ui`:** the app's shadcn components (Button, Input, Textarea, Badge, Switch, Checkbox, Dialog, Empty, Sidebar, Attachment, Message, Bubble, and MessageScroller parts), `Streamdown` for Markdown, and the app's own `Header` (a screen's top bar), `Blob` (a bot's look), and `Reply` (a turn's reply, steps and all)

**How the app runs plugin parts:**
- **The routes** are `/<plugin>/…`, checked after the core's paths.
- **Each part sits in an error boundary.** A plugin that throws shows a short card in its place, and the rest of the app keeps working.
- **Adding, updating, or removing a plugin** reloads the plugin list. Its old code stays loaded until the page reloads.
- **A nav entry without an icon** shows its label's first letter.
- **A message a plugin handled** shows "A plugin took this message." under it, and one a plugin sent shows "From <plugin>".
- **Only the page and CSS files** that `plugin.json` names are served, from `/api/plugins/<name>/files/`. A pinned plugin's URL names its commit and is kept for good; a local one's names when the file last changed.

### Installing, updating, and removing

- **Sources:**
  - **fxbot's list:** `plugins-registry.json` on fxbot.sh, next to the other two lists (`FXBOT_LISTS_URL`). Each entry is `{ name, description, repo, path }`, tagged **fxbot**.
  - **A GitHub repository,** with an optional folder: `owner/repo` or `owner/repo/path/to/plugin`.
  - **A folder on this machine,** for writing a plugin in a checkout: `FXBOT_PLUGIN_DIRS` lists folders in the server's environment, which load at start, unpinned. fxbot loads one again a moment after its files change. A release install doesn't use it: its container sees no folder of the machine but its own.
- **The preview** (the add-on page) pins the source's HEAD commit, then reads the plugin through `archive.ts`. Plugins get their own limits: 2 MiB a file, text only, 20 MB in all.
- **The page shows:**
  - its description and `plugin.json`
  - that it **runs code inside fxbot**, naming its server and page files, each readable
  - its settings, its migrations (readable), and its skills and remote servers
  - what's not used yet, such as stdio servers
- **Add** checks the hash the page saw, then:
  1. writes the files to `FXBOT_DATA/plugins/<name>/<commit>/`, which in a release is `/var/lib/fxbot/data/plugins/` on the machine
  2. makes the schema and runs the migrations
  3. saves the add-on and its secrets
  4. imports the server module, calls `setup`, and remakes the agents if it added tools
- **The row** then shows what the plugin registered: its tools, hooks, routes, and page places.
- **What it carries.** Its skills, `skills/<name>/SKILL.md` as skills.sh lays them out, join the catalog and the `skill` tool of the bots the plugin is on for. Each remote server in its `mcp.json` is added as an MCP add-on of its own, under the usual rules for addresses, and goes when the plugin does; an update leaves them as they are. A local plugin's servers may be on this machine.
- **Updates.** The hourly check of skills' repositories covers plugins too. A newer commit that changes the plugin's files marks **Update available**. Its page shows what changed, and **Update** cleans up the old code, runs the new migrations, and loads the new commit. A failed load keeps the old one running.
- **Removing a plugin:** cleanup, then its hooks, tools, and routes go. fxbot drops its schema, and deletes its files, its secrets, and its bot switches.

### Failures and speed

- **A hook that throws is logged and skipped,** except `tool.before`, where it blocks the call, as in Pi. The add-on's row shows its last error.
- **Time limits.** A `message`, `instructions`, `tool.before`, or `tool.after` handler gets 5 seconds, and is then treated as if it threw. `setup` gets 10. `turn.*` handlers run beside the turn and never hold it up.
- **A handled message** answers `send` with `{ messageId, sessionId, handled: true }`, and nothing reaches the chat.
- **A plugin whose `setup` throws, or whose migrations fail,** stays added but off, with the error on its row. The rest of fxbot starts.
- **No plugins, no cost.** Hook lists are empty arrays, the page loads no plugin code, and there are no timers.

### Trust

A plugin runs with everything fxbot can reach, as Pi, opencode, and eve plugins do: in a release, everything fxbot's container can reach. The add-on page says so before **Add**. Plugins are pinned to a commit, ask again before any change, and never update on their own.

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `GET /api/plugins` | `plugins.list()`: name, version, page and CSS URLs, for the page |
| `GET /api/plugins/:name/files/*` | `plugins.file(name, path)`: the plugin's page code and CSS, `cache-control: immutable` under the commit |
| `* /api/plugins/:name/*` | the plugin's own routes |
| `POST /api/addons/preview`, `POST /api/addons`, … | the [add-ons](addons.md) calls, with `{ plugin: "owner/repo/path" }` as a ref |
| `PUT /api/addons/:id/settings` | `addons.configure(id, settings)`: secrets write-only |
| `GET /api/addons/:id/log` | `addons.log(id)`: recent log lines and errors |

### Where the code goes

- **`packages/sdk`:**
  - `plugins.ts`: loading, the server API, hooks, schemas and migrations, settings, and install, update, and remove
  - `plugin-api.ts`: its types, exported from `@fxbot/sdk` for plugin authors
  - In `index.ts`: the hook sites, `from`, sessions for plugins, and tools through the wrapper. Also `registry.ts` (the plugins list), `archive.ts` (per-caller limits), and `0006_plugins.sql`.
- **`packages/server`:** the routes above, and `FXBOT_PLUGIN_DIRS`.
- **`packages/website`:** `plugins-registry.json` copied to the site with the other two lists.
- **`packages/ui`:**
  - `plugins.tsx`: the loader, `@fxbot/app`, and the error boundaries
  - the places in `app.tsx` and `steps.tsx`
  - the plugin parts of the add-on pages
- **`plugins/chat-rooms/` and `plugins/herdr/`:** fxbot's own plugins, in this repository but outside the workspaces, and never imported by the core ([question 1](#5-open-questions)). Each is added from GitHub like anyone's. Their page code is `page.jsx`, built into `page.js` with rolldown, which comes with Vite.

### The first plugins

**Chat rooms** ([stub](chat-rooms.md)) uses every part of the API:
- **Tables:** `rooms` (id, name), `members` (room, bot), `messages` (id, room, author, text, at), and `sessions` (room, bot, session).
- **Page:** a **Rooms** group in the sidebar, with a **+** that names a room and picks its bots. The room at `/chat-rooms/rooms/<id>` shows its messages and a message box, made from the app's components.
- **A message in a room:**
  1. The owner's message is saved.
  2. Each member bot answers once, in turn, in its own session for that room. That session is made with `fx.chats.newSession` and prompted with the room's messages since its last turn.
  3. The `instructions` hook tells it which room it is in, and who else is there. The plugin reads the bot's reply from that session's stream, from the cursor it kept, shows it as it's written, and saves it to the room at `turn_end`.
  4. Bots don't start new rounds, so the room never runs on by itself ([question 6](#5-open-questions)).
- **Live view:** a room route streams the replying bot's session lines, so its reply shows as it is written.

**herdr** is small, and proves tools, settings, and a tool view:
- **Tools:** `herdr_list_agents` and `herdr_read_pane` talk to herdr's socket directly, so no MCP server is needed. Both are read-only.
- **A setting** holds the socket's path, `~/.config/herdr/herdr.sock` by default.
  - **In a checkout** run by herdr's own user, that's all.
  - **In a release,** fxbot's container runs as the `fxbot` user, and herdr's socket is its owner's alone. The plugin's README shows the owner a relay, with `socat`, run by root, that offers the socket to the `fxbot` user inside fxbot's data folder, which the container already mounts. fxbot's core never names herdr.
- **A tool view** shows the agents as a table.
- **A skill** says when to use the tools.

### Not in this phase

- Local MCP servers (stdio), setup steps that install tooling, and npm dependencies ([question 4](#5-open-questions)). A plugin can start a process from its own server code. Installed programs belong on the [agent computer](computer.md), a plugin that other plugins build on.
- Claude-format plugins and marketplaces. A plugin's own skills and remote servers already use the shared format.
- Hooks inside a model request, which libfx doesn't offer.
- Hooks for compaction. [Context management](../../phases/context-management.md) adds one when it builds compaction.
- Any page place a first plugin doesn't need, such as a full-screen route for the [herdr screen](../../phases/herdr-screen.md).

### Size

The plugin API is about 750 lines:

| Part | Lines |
| --- | --- |
| `plugins.ts` and `plugin-api.ts` | about 380 |
| Hook sites, sessions, and `from` in the SDK | about 80 |
| Routes | about 50 |
| Page loader, places, and add-on pages | about 240 |

The plugins themselves add about 350 lines for chat rooms and about 120 for herdr.

**As built** (2026-11-03): about 1,700 lines in the core, over twice the estimate. `plugins.ts` is 750, with installing from GitHub, updates, and the skills and servers a plugin carries; `plugin-api.ts` 65; the page's loader 205; the Plugins tab, a plugin's page, and its settings 380; and about 320 more across the SDK, the server, and the app. Chat rooms is about 520 lines, and herdr about 125.

## 4. Checklist

Checks use a sample plugin in the scratchpad that uses every hook and place, disposable Postgres, the mock model, and Playwright. Nothing reaches the real herdr except the human's check.

**M1. Loading and hooks**
- [x] A plugin in `FXBOT_PLUGIN_DIRS` loads at start. Its tool reaches its bots and no others, named `<plugin>_<tool>`.
- [x] `message` hooks:
  - A change to the text reaches the model; checked in the mock model's request.
  - `{ handled: true }` runs no turn.
  - Two plugins' changes chain in the order they were added.
- [x] `instructions` adds a line that the mock model sees, for the session the hook picked and no other.
- [x] Tool hooks:
  - `tool.before` changes a core tool's input, and blocks an MCP tool's call with its reason.
  - A `tool.before` that throws blocks.
  - `tool.after` changes a result.
- [x] `turn.start` and `turn.end` fire with the bot, the session, and the reply, without holding up the stream.
- [x] A hook that throws, or takes over 5 seconds, is logged on the row, and the turn goes on.
- [x] A `setup` that throws leaves the plugin off with its error, and fxbot starts.

**M2. Data, settings, routes, and turns**
- [x] The migrations make tables in `plugin_<name>`, and `fx.sql` reaches them unqualified. An update runs only new files.
- [x] Removing the plugin drops the schema.
- [x] A secret setting reaches `fx.settings`, is never in any response, and is sealed in Postgres.
- [x] `GET /api/plugins/<name>/…` reaches its route, and a streamed response streams.
- [x] Turns from a plugin:
  - `fx.chats.send` without a session shows in the bot's chat with "From <plugin>".
  - With a session from `newSession`, it stays out of that chat, and `chat_history` finds it.
  - After a provider switch, `send` to the old session answers 409.

**M3. The page**
- [x] A plugin's page bundle loads with the app's React: its component uses `useState`, and React reports one copy.
- [x] Each place renders:
  - a route, the sidebar, and a footer button
  - a composer control that sets the draft
  - a tool view, Settings, and a bot's settings
- [x] A plugin part that throws shows its card, and the chat still works.
- [x] With no plugins added, the page loads no plugin code (checked in Playwright's request log).
- [x] Phone width: the sidebar group, the footer button, and a route fit.

**M4. Installing**
- [x] Mock GitHub (the skills checks' mocks) serves a plugin repository with a folder.
- [x] The add-on page:
  - Its preview pins the commit, says the plugin runs code inside fxbot, and lists its files, settings, migrations, and skills.
  - It counts a stdio server as not used.
- [x] Add, the row's parts, and a per-bot switch work. The plugin's skills join the catalog, and its remote server connects.
- [x] The check marks an update when the plugin's files change, and its page lists the changed files.
- [x] A failed load during an update keeps the old version running.
- [x] Remove cleans up: the schema, the files, the secrets, and the switches are gone, and its cleanup ran.
- [x] fxbot's list serves `plugins-registry.json` in the mock site, and its plugins are tagged **fxbot** on the Plugins tab.

**M5. The first plugins, docs, and checks**
- [x] Chat rooms against the mock model:
  - A room with two bots: each answers once, in order. The second sees the first's reply, and the room shows both as they stream.
  - Removing a bot from the room stops its answers.
- [x] herdr against a stub socket: list agents and read a pane, with the table view, a socket path setting, and a missing socket answered clearly.
- [x] Docs:
  - The owners' docs gain a how-to, "Add a plugin".
  - The SDK's pages gain a how-to, "Write a plugin", and a reference page, "Plugin API", for authors.
  - The Core and add-ons page names plugins.
  - The README's variables table lists `FXBOT_PLUGIN_DIRS`.
  - The CHANGELOG notes `0006_plugins`.
- [x] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass.

**The human runs these:**
- Add chat rooms from GitHub, make a room with two bots, and talk with them.
- Add herdr, point it at their socket (through the relay in a release), and ask a bot what herdr is running.

## 5. Open questions

Each has a default.

1. **Where fxbot's own plugins live.** *Default:* `plugins/<name>/` in this repository, outside the workspaces and never imported by the core, added from GitHub like anyone's. The alternative is a repository of their own.
2. **The namespace.** *Settled:* `sh.fxbot`, from fxbot.sh, which is live.
3. **Dependencies.** *Default:* none installed. A plugin bundles what it needs. Pi installs `dependencies`, which brings install scripts and a slower add.
4. **Local MCP servers and setup steps.** *Default:* the [agent computer](computer.md) phase. A plugin that needs a process starts it from its own code, as herdr's talks to a socket instead of running herdr-mcp.
5. **How page code loads.** *Default:* a CommonJS bundle run with the app's `require`, as opencode does. The alternative is ES modules with an import map, which needs files that re-export the app's React, made at build time.
6. **Who answers in a room.** *Default:* each member bot answers each of the owner's messages once, in turn, and bots never start rounds. Later choices could be only the bot that's named, or bots answering each other with a cap on rounds.
7. **Turns a plugin starts in a bot's own chat.** *Default:* shown with "From <plugin>" on the message.
