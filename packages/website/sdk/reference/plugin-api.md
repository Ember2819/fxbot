# Plugin API

What a plugin is made of, and every call it can make: its server code's `fx`, and its page code's `app` and `@fxbot/app`. A guide to writing one: [Write a plugin](/sdk/how-to/write-a-plugin/).

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
| `name` | Required. Up to 40 lowercase letters, digits, and dashes. Its tools are `<name>_<tool>`, its routes are under `/api/plugins/<name>/`, its page paths under `/<name>/`, and its schema is `plugin_<name>`, with `_` for `-`. It can't be `chat`, `memory`, `library`, or `skill`, or an MCP server's prefix. |
| `version` | Shown on its row. Default `0.0.0` |
| `description` | Shown on its page and its row |
| `extensions["sh.fxbot"].server` | Its server code, a path inside the folder |
| `extensions["sh.fxbot"].page` | Its page code |
| `extensions["sh.fxbot"].css` | Its CSS |
| `extensions["sh.fxbot"].migrations` | A folder of `.sql` files |
| `extensions["sh.fxbot"].settings` | A list of settings, each with `name`, `description`, and optionally `default`, `isRequired`, and `isSecret` |

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
| `fx.sql` | A [postgres](https://github.com/porsager/postgres) client in the plugin's own schema, with two connections at most |
| `fx.settings` | Its settings, with defaults, and secrets opened. The same object, kept up to date. |
| `fx.bots.list()`, `fx.bots.get(id)` | The bots, as [the fxbot object](/sdk/reference/server-api/) lists them |
| `fx.chats` | Sessions and turns of its own. See [Turns](#turns). |
| `fx.log(...parts)` | A line in its log, which its settings in **Add-ons** show |
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
| `execute(input, call)` | Runs one call. `call` has the `bot` and `session` of the chat, and a `signal` that aborts with the turn. A string goes to the model as it is, and anything else as JSON. |

Adding a tool makes fxbot's agents again. A call from a bot the plugin isn't on for fails.

## Routes

```ts
fx.route("GET", "/rooms/:id", async (request, { id }) => Response.json({ id }));
```

- A route answers `/api/plugins/<name>/<path>`, with a web `Request` and `Response`. `:name` parts come in `params`.
- A `Response` with a stream for its body streams to the caller. The request's `signal` aborts when the caller goes.
- fxbot's server checks first: a write from another site's page gets 403, and a body over 12 MiB 413.
- A handler that throws answers 500, `{ "error": "<message>" }`, and the error goes in the log.
- `/api/plugins/<name>/files/` serves its page code and CSS, and no route there is reached.

## Data

- Adding the plugin makes the schema `plugin_<name>`, then runs each file in its migrations folder, in name order, each in a transaction. The names run are kept in the schema's `_migrations`.
- An update runs only the files that are new. Never change a file that has shipped.
- `fx.sql` reaches the schema's tables by name, without the schema.
- Removing the plugin drops the schema.

## Settings

- The owner sets them in the plugin's settings in **Add-ons**. Each is text, up to 8 KiB. Clearing one brings back its default.
- They're sealed together in Postgres. A secret one is never shown again, and its row says only that it's set.
- `fx.settings` has them. `fx.on("settings", …)` hears a change.

## Turns

A plugin's turns run as the owner's do, with the same hooks, history, library, and `busy`.

| Call | What it does |
| --- | --- |
| `fx.chats.newSession(bot)` | A session of the plugin's own for the bot, on the bot's provider now. Keep its id. |
| `fx.chats.send(bot, { text, files?, session?, messageId? })` | A message. Without `session`, it goes to the bot's own chat, which shows it as "From <plugin>". With one, it stays out of the bot's chat, its earlier chats, and its preview, and `chat_history` still finds it. `messageId` defaults to a new UUID. |
| `fx.chats.stream(bot, session, cursor?)` | That session's lines, as NDJSON, from `cursor` on, then each new one. The same lines as [`fxbot.stream`](/sdk/how-to/stream-replies/). |

A session belongs to the provider it started on. After the bot moves to another provider, `send` and `stream` for it fail with `status` 409: make a new one.

## Page code

`page` is one CommonJS bundle that leaves `react`, `react/jsx-runtime`, and `@fxbot/app` out. The page runs it with a `require` that gives those three, its own copies, and nothing else. Its default export is called with `app`:

| Call | Where it shows |
| --- | --- |
| `app.route(path, Component)` | The screen at `/<plugin><path>`. `path` may have `:name` parts, which `Component` gets as `params`. |
| `app.sidebar(Component)` | A group in the sidebar, after the bots |
| `app.nav({ label, path, icon? })` | A button in the sidebar's footer row, to `/<plugin><path>`. `icon` is a component; without one, the button shows the label's first letter. |
| `app.composer(Component)` | A control beside the attach button. It gets `bot`, `setDraft(text)`, and `attach(files)`. |
| `app.toolView(tool, Component)` | How a call of `<plugin>_<tool>` shows in a reply. It gets `call`: `name`, `input`, `output`, `error`, and `done`. |
| `app.settings(Component)` | A section in Settings |
| `app.botSettings(Component)` | A section in a bot's settings. It gets `bot`. |

Each part sits in its own error boundary: one that throws shows a short card in its place, and the rest of the app goes on. A plugin's page parts are for everyone, whichever bots it's on for. The page reads the list of plugins again after a change in **Add-ons**, and keeps code it already ran until it reloads.

`@fxbot/app`:

| Export | What it is |
| --- | --- |
| `api(path, init?)` | `fetch` for the plugin's own routes |
| `client` | The app's client, as [The client](/sdk/reference/client/) describes |
| `applyLine` | Folds a stream line into turns |
| `go(path)` | Opens a path in the app |
| `useBots()` | The app's list of bots, or `null` while it loads |
| `ui` | The app's components: Button, Input, Textarea, Badge, Switch, Checkbox, the Dialog, Empty, Sidebar (with `useSidebar`), Attachment, Message, Bubble, and MessageScroller parts, `Streamdown` for Markdown, `Header` for a screen's top bar, `Blob` for a bot's look, and `Reply` for a turn's reply |

The page's styles hold only the classes the app uses. A plugin brings its own CSS for anything else.

## Where plugins come from

| Source | How |
| --- | --- |
| GitHub | **Add-ons**, on the **Plugins** tab: `owner/repo`, or `owner/repo/folder`. Its page pins the repository's newest commit, and shows its code. **Add** writes its files to `FXBOT_DATA/plugins/<name>/<commit>/`. |
| fxbot's list | `plugins-registry.json` on fxbot's site, read hourly, tagged **fxbot** |
| A folder | `FXBOT_PLUGIN_DIRS`, in a checkout. Added on first sight, loaded at start, and loaded again a moment after its files change |

- From GitHub, files are text only, up to 2 MiB each and 20 MB in all.
- The hourly check marks **Update available** when a plugin's files change in its repository. **Update** moves it to the commit its page showed, and keeps the old version running when the new one doesn't load.
- Its skills join the catalog of the bots it's on for. Each remote server in its `mcp.json` is added as an MCP server of its own, under the usual rules for addresses, and is removed with it. A server that runs a command isn't used yet.
- In a release, fxbot runs in its container, and a plugin reaches what the container does.
