---
title: "Plugin API"
description: "What a plugin with code is made of, and every call it can make: its server code's fx, and its page code's app and @fxbot/app. fxbot calls such a plugin, a folder with plugin.json, a package. A guide to writing one: Write a plugin."
---

What a plugin with code is made of, and every call it can make: its server code's `fx`, and its page code's `app` and `@fxbot/app`. fxbot calls such a plugin, a folder with `plugin.json`, a package. A guide to writing one: [Write a plugin](/sdk/how-to/write-a-plugin/).

## The folder

```text
my-plugin/
├── plugin.json
├── fxbot/
│   ├── server.ts           server code: plain JavaScript, or TypeScript that Node runs as it is
│   ├── page.js             page code: one CommonJS bundle
│   ├── page.css            optional
│   └── migrations/         optional: its tables
├── skills/<name>/SKILL.md  optional: skills, as Agent Skills lays them out
└── mcp.json                optional: MCP servers
```

Only `plugin.json` is required, and only the paths it names count.

## plugin.json

| Field | What it is |
| --- | --- |
| `name` | Required. Up to 40 lowercase letters, digits, and dashes. Its tools are `<name>_<tool>`, its routes are under `/api/plugins/<name>/`, its page paths under `/<name>/`, and its schema is `plugin_<name>`, with `_` for `-`. It can't be `chat`, `memory`, `library`, or `skill`, or an MCP server's prefix, nor a name fxbot uses itself: `pages`, `preview`, `search`, `addons`, `plugins`, `settings`, `profiles`, or 12 hex characters, which is a plugin's id. |
| `version` | Shown on its row. Default `0.0.0` |
| `description` | Shown on its page and its row |
| `extensions["sh.fxbot"].server` | Its server code, a path inside the folder |
| `extensions["sh.fxbot"].page` | Its page code |
| `extensions["sh.fxbot"].css` | Its CSS |
| `extensions["sh.fxbot"].migrations` | A folder of `.sql` files |
| `extensions["sh.fxbot"].settings` | A list of settings, each with `name`, `description`, and optionally `default`, `isRequired`, and `isSecret` |
| `extensions["sh.fxbot"].needs` | The plugins it needs, each name mapped to an object for that plugin, up to 16 KiB in all. See [Plugins that need others](#plugins-that-need-others). |

## Server code

The server module's default export is called once when the plugin loads, with `fx`. It may be async, and may return a cleanup function, which runs when the plugin is turned off, updated, or removed, and when fxbot stops.

```ts
import type { PluginApi } from "@fxbot/sdk";

export default async function setup(fx: PluginApi) {
  const timer = setInterval(() => fx.log("still here"), 60_000);
  return () => clearInterval(timer);
}
```

| Member | What it is |
| --- | --- |
| `fx.name` | The plugin's name |
| `fx.on(event, handler)` | A hook. See [Hooks](#hooks). |
| `fx.tool(tool)` | A tool for bots. See [Tools](#tools). |
| `fx.route(method, path, handler)` | A route. See [Routes](#routes). |
| `fx.socket(path, handler)` | A WebSocket. See [Sockets](#sockets). |
| `fx.sql` | A [postgres](https://github.com/porsager/postgres) client in the plugin's own schema, with two connections at most |
| `fx.settings` | Its settings, with defaults, and secrets opened. The same object, kept up to date. |
| `fx.bots.list()`, `fx.bots.get(id)` | The bots, as [the fxbot object](/sdk/reference/server-api/) lists them |
| `fx.chats` | Sessions and turns of its own. See [Turns](#turns). |
| `fx.dependents()` | The added plugins that need this one: `{ name, version, needs }` each, where `needs` is its object for this plugin |
| `fx.library.read(bot, id)` | A library item's `name`, `type`, and `bytes`, if it's tagged for the bot; otherwise it throws |
| `fx.library.save({ bot, session, name, type, bytes })` | Saves an image, or UTF-8 text, to the bot's library, tagged for the chat, through the library's checks. It answers the item. |
| `fx.skills.files(bot, name)` | The files besides `SKILL.md` of the skill the bot sees by that name, as `{ path, text }`. None when it has no such skill. |
| `fx.machine` | In an install made by `setup.sh`, the machine's `fxbot` command, for a job only root can do; `null` in a checkout. `ask("computer")` asks it to set up the computer plugin's engine, and `status("computer")` says how that went: `{ state, error? }`, with `state` `asked`, `working`, `done`, or `failed`, or `null` when nothing asked. `computer` is its only job. |
| `fx.log(...parts)` | A line in its log, which its settings in **Plugins** show |
| `fx.signal` | An `AbortSignal` that aborts when the plugin unloads |

Setup gets 10 seconds. A setup that throws or runs late leaves the plugin added but off, with its error on its row. fxbot starts either way. Turns can start only after fxbot has: not from setup itself.

## Hooks

Handlers run in the order the plugins were added, and change the event's fields in place, so each sees what the last one changed. A plugin's hooks reach only the bots it's on for.

| Event | When | Fields | Can |
| --- | --- | --- | --- |
| `message` | Before a message runs, after the chat is known | `bot`, `session`, `text`, `files`, `from` | Change `text` and `files`, or answer `{ handled: true }`, and no turn runs |
| `instructions` | Each time a chat opens | `bot`, `session`, `instructions`, a list | Add, change, or remove entries |
| `tool.before` | Before every tool call: fxbot's, MCP servers', skills', and plugins' | `bot`, `session`, `tool`, `input` | Change `input`, or answer `{ block: reason }`, which the model gets as a failed call |
| `tool.after` | After it | the same, with `result`, or `error` when it failed | Change `result` |
| `turn.start` | Once libfx stores the prompt | `bot`, `session`, `messageId`, `text`, `from` | Observe |
| `turn.end` | When the turn ends | the same, with `reply`, and `error` when it failed | Observe |
| `settings` | The owner changed its settings | `settings` | Observe |
| `dependents` | A plugin that needs this one was added, updated, or removed | `dependents`, as `fx.dependents()` gives them | Observe |

- `message`, `instructions`, `tool.before`, and `tool.after` handlers get 5 seconds each. One that throws or runs late is logged and skipped, except `tool.before`, where it blocks the call.
- `turn.start` and `turn.end` run beside the turn, and never hold it up.
- `from` is the plugin that sent the message, when one did.
- A message that a `message` hook handled answers `send` with `{ messageId, sessionId, handled: true }`.

## Tools

```ts
fx.tool({
  name: "greet",
  description: "Greet someone by name",
  inputSchema: { type: "object", properties: { name: { type: "string" } } },
  idempotent: true,
  execute: async (input, { bot, session, signal }) => `Hello, ${input.name}!`,
});
```

| Field | What it is |
| --- | --- |
| `name` | Lowercase letters, digits, and `_`. Bots see `<plugin>_<name>`, up to 64 characters. |
| `description` | What the model reads |
| `inputSchema` | A JSON Schema object for the input |
| `idempotent` | Whether running a call twice is harmless, so a call cut off by a crash runs again |
| `execute(input, call)` | Runs one call. `call` has the `bot` and `session` of the chat, and a `signal` that aborts with the turn. A string goes to the model as it is, and anything else as JSON, but for `{ type: "libfx.tool-result", text, images }`, whose images, up to 8, the model sees. |

Adding a tool makes fxbot's agents again. A call from a bot the plugin isn't on for fails, and so does a result over 64 KiB.

## Routes

```ts
fx.route("GET", "/rooms/:id", async (request, { id }) => Response.json({ id }));
```

- A route answers `/api/plugins/<name>/<path>`, with a web `Request` and `Response`. `:name` parts come in `params`.
- A `Response` with a stream for its body streams to the caller. The request's `signal` aborts when the caller goes.
- fxbot's server checks first: a write from another site's page gets 403, and a body over 12 MiB 413.
- A handler that throws answers 500, `{ "error": "<message>" }`, and the error goes in the log.
- `/api/plugins/<name>/files/` serves its page code and CSS, and no route there is reached.

## Sockets

```ts
fx.socket("/desktop/:bot", (socket, request, { bot }) => {
  socket.onmessage = (data) => socket.send(data);
  socket.onclose = () => {};
});
```

- A socket is a WebSocket at `/api/plugins/<name>/<path>`, for a two-way stream that a route's request and response can't carry. The page opens one with `ws:` or `wss:`, matching its own address.
- `socket` has `send(data)`, `close(code?, reason?)`, `bufferedAmount`, and two handlers to set: `onmessage`, which gets a binary message as a `Buffer` and text as a string, and `onclose`.
- fxbot's server checks first: a socket opened from another site's page gets 403, since a WebSocket opens with a GET, which the write check doesn't cover. A path no socket has gets 404.
- A handler that throws closes its socket with code 1011, and the error goes in the log. Turning the plugin off, removing it, or stopping fxbot closes its open sockets.

## Data

- Adding the plugin makes the schema `plugin_<name>`, then runs each file in its migrations folder, in name order, each in a transaction. The names run are kept in the schema's `_migrations`.
- An update runs only the files that are new. Never change a file that has shipped.
- `fx.sql` reaches the schema's tables by name, without the schema.
- Removing the plugin drops the schema.

## Settings

- The owner sets them in the plugin's settings in **Plugins**. Each is text, up to 8 KiB. Clearing one brings back its default.
- They're sealed together in Postgres. A secret one is never shown again, and its row says only that it's set.
- `fx.settings` has them. `fx.on("settings", …)` hears a change.

## Turns

A plugin's turns run as the owner's do, with the same hooks, history, library, and `busy`.

| Call | What it does |
| --- | --- |
| `fx.chats.newSession(bot)` | A session of the plugin's own for the bot, on the bot's provider now. Keep its id. |
| `fx.chats.send(bot, { text, files?, session?, messageId? })` | A message. Without `session`, it goes to the bot's own chat, which shows it as "From <plugin>". With one, it stays out of the bot's chat, its earlier chats, and its preview, and `chat_history` still finds it. `messageId` defaults to a new UUID. |
| `fx.chats.stream(bot, session, cursor?)` | That session's lines, as NDJSON, from `cursor` on, then each new one. The same lines as [`fxbot.stream`](/sdk/how-to/stream-replies/). |
| `fx.chats.cancel(bot, session)` | Stops the turn running in one of the plugin's own sessions, if one runs. It ends `cancelled`, and the session's stream says so. Since 0.4.1. |

A session belongs to the provider it started on. After the bot moves to another provider, `send` and `stream` for it fail with `status` 409: make a new one.

## Plugins that need others

A plugin names the plugins it needs, and what it asks of each, under `needs`:

```json
"needs": { "computer": { "setup": ["apt-get update && apt-get install -y --no-install-recommends chromium"] } }
```

- Its page says what it needs. Adding it is refused until those are added, and they can't be removed while it is.
- It loads after the plugins it needs.
- What each object holds is up to the plugin it names, which reads them with `fx.dependents()` and hears a change with the `dependents` event.
- A plugin with no code, only `needs` and skills, is a plugin too.

## Page code

`page` is one CommonJS bundle that leaves `react`, `react/jsx-runtime`, and `@fxbot/app` out. The page runs it with a `require` that gives those three, its own copies, and nothing else. Its default export is called with `app`:

| Call | Where it shows |
| --- | --- |
| `app.route(path, Component)` | The screen at `/<plugin><path>`. `path` may have `:name` parts, which `Component` gets as `params`. |
| `app.sidebar(Component)` | A group in the sidebar, after the bots |
| `app.nav({ label, path, icon? })` | A button in the sidebar's footer row, to `/<plugin><path>`. `icon` is a component; without one, the button shows the label's first letter. |
| `app.botPanel(Component)` | Above the tabs of a bot's panel, beside its chat. It gets `bot`. |
| `app.composer(Component)` | A control beside the attach button. It gets `bot`, `setDraft(text)`, and `attach(files)`. `setDraft` also takes a function from the draft to the new text. |
| `app.toolView(tool, Component)` | How a call of `<plugin>_<tool>` shows in a reply. It gets `call`: `name`, `input`, `output`, `error`, and `done`. |
| `app.settings(Component)` | A section in Settings |
| `app.botSettings(Component)` | A section in a bot's settings. It gets `bot`. |

Each part sits in its own error boundary: one that throws shows a short card in its place, and the rest of the app goes on. A plugin's page parts are for everyone, whichever bots it's on for. The page reads the list of plugins again after a change in **Plugins**, and keeps code it already ran until it reloads.

`@fxbot/app`:

| Export | What it is |
| --- | --- |
| `api(path, init?)` | `fetch` for the plugin's own routes |
| `client` | The app's client, as [The client](/sdk/reference/client/) describes |
| `applyLine` | Folds a stream line into turns |
| `go(path)` | Opens a path in the app |
| `useBots()` | The app's list of bots, or `null` while it loads |
| `createPortal(children, node)` | React's, from `react-dom`, for drawing a component into DOM the plugin doesn't render with React, such as an editor's node. Since 0.4.1. |
| `ui` | The app's components: Button, Input, Textarea, Badge, Switch, Checkbox, the Dialog, Empty, Sidebar (with `useSidebar`), Attachment, Message, Bubble, and MessageScroller parts, `Streamdown` for Markdown, `Header` for a screen's top bar, `Blob` for a bot's look, and `Reply` for a turn's reply |

The page's styles hold only the classes the app uses. A plugin brings its own CSS for anything else.

## Where plugins come from

| Source | How |
| --- | --- |
| GitHub | **Plugins**, on **Browse**, under **From GitHub**, with unvetted plugins on: `owner/repo`, or `owner/repo/folder`. Its page pins the repository's newest commit, and shows its code. **Add** writes its files to `FXBOT_DATA/plugins/<name>/<commit>/`. |
| fxbot's list | `plugins-registry.json` on fxbot's site, read hourly, tagged **fxbot** |
| A folder | `FXBOT_PLUGIN_DIRS`, in a checkout. Added on first sight, loaded at start, and loaded again a moment after its files change |

- From GitHub, files are text only, up to 2 MiB each and 20 MB in all.
- The hourly check marks **Update available** when a plugin's files change in its repository. **Update** moves it to the commit its page showed, and keeps the old version running when the new one doesn't load.
- Its skills join the catalog of the bots it's on for. Each remote server in its `mcp.json` is added with it, under the usual rules for addresses: a record of its own, which shows in the package's settings, follows the package's switch and bots, and is removed with it. A server that runs a command isn't used yet.
- In a release, fxbot runs in its container, and a plugin reaches what the container does.
