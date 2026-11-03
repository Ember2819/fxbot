# The client

`@fxbot/sdk/client` is a typed client for an fxbot server's [HTTP API](/sdk/reference/http-api/), for a page or a script.

```ts
import { applyLine, createClient, type Turn } from "@fxbot/sdk/client";

const client = createClient({ baseUrl: "http://127.0.0.1:8787" });
let turns: Turn[] = [];
for await (const line of client.stream(botId, { signal })) turns = applyLine(turns, line);
```

It imports nothing from `@fxbot/sdk`'s main entry, so a browser bundle can take it. See [Build a page on the client](/sdk/how-to/web-page/).

## createClient

`createClient(options?)` returns a `Client`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `baseUrl` | `string` | `""`, the page's own origin | The server's origin, such as `http://127.0.0.1:8787`. A script needs it. |
| `onVersion` | `(version: string) => void` | None | Hears the version in each answer's `x-fxbot-version` header, so a page can notice a new release |

- Each call asks `<baseUrl>/api/...` with `fetch`, sends JSON, and resolves to the JSON answer.
- A call that fails throws an `Error` with the server's message. When the server can't be reached, or answers with something that isn't JSON, such as a proxy's page, the message is `unreachable`: "Cannot reach the server." The `Error` carries no status.
- The client holds no keys or tokens. A key goes to the server once, in `providers.add` or `providers.update`, and comes back only as `hasKey`. Header values and OAuth clients go up once, in `plugins.setSecrets`.
- The server refuses a write with 403 when the request's `Origin` header names another host than its `Host`. A browser sends `Origin`, so a page on another origin gets 403 for every write. Node's `fetch` sends no `Origin`, so a script's writes pass. The server sends no CORS headers.

## Calls

Each call is one route of the [HTTP API](/sdk/reference/http-api/). They mirror [the fxbot object](/sdk/reference/server-api/), which has the rules for each.

### Health and updates

| Call | Route | Returns |
| --- | --- | --- |
| `health()` | `GET /api/health` | `{ ok: true, version }` |
| `update.get()` | `GET /api/update` | `UpdateStatus` |
| `update.start()` | `POST /api/update` | `UpdateStatus` |

### Bots

| Call | Route | Returns |
| --- | --- | --- |
| `profiles.list()` | `GET /api/profiles` | `Profile[]` |
| `profiles.get(id)` | `GET /api/profiles/<id>` | `Profile` |
| `profiles.create(fields)` | `POST /api/profiles` | `Profile` |
| `profiles.update(id, fields)` | `PATCH /api/profiles/<id>` | `Profile` |
| `profiles.remove(id)` | `DELETE /api/profiles/<id>` | `{ ok: true }` |
| `profiles.earlier(id)` | `GET /api/profiles/<id>/earlier` | `Turn[]` |
| `profiles.skills(id)` | `GET /api/profiles/<id>/skills` | `BotSkill[]` |
| `profiles.memories.list(id, query?)` | `GET /api/profiles/<id>/memories?query=` | `Memory[]` |
| `profiles.memories.add(id, text)` | `POST /api/profiles/<id>/memories` | `Memory` |
| `profiles.memories.update(id, memoryId, text)` | `PATCH /api/profiles/<id>/memories/<memoryId>` | `Memory` |
| `profiles.memories.remove(id, memoryId)` | `DELETE /api/profiles/<id>/memories/<memoryId>` | `{ ok: true }` |

`profiles.memories.list` takes the search as a string. An empty one lists the newest.

### Chat

| Call | Route | Returns |
| --- | --- | --- |
| `send(id, message)` | `POST /api/profiles/<id>/messages` | `{ messageId, sessionId }` |
| `stream(id, options?)` | `GET /api/profiles/<id>/stream?cursor=` | An async generator of `StreamLine` |

`send` resolves once the server has stored the message. The reply arrives on the stream.

### Settings

| Call | Route | Returns |
| --- | --- | --- |
| `settings.get()` | `GET /api/settings` | `Settings` |
| `settings.update(fields)` | `PATCH /api/settings` | `Settings` |
| `settings.embedding()` | `GET /api/settings/embedding` | `EmbeddingStatus` |

`settings.update` also takes `local`: `cpu`, `gpu`, or `off`. It asks the machine to run its local embedder that way, in an install made by `setup.sh`.

### Providers and sign-ins

| Call | Route | Returns |
| --- | --- | --- |
| `providers.list()` | `GET /api/providers` | `Provider[]` |
| `providers.add(provider)` | `POST /api/providers` | `Provider` |
| `providers.update(id, fields)` | `PATCH /api/providers/<id>` | `Provider` |
| `providers.remove(id)` | `DELETE /api/providers/<id>` | `{ ok: true }` |
| `providers.models(id)` | `GET /api/providers/<id>/models` | `Model[]` |
| `providers.teams(id)` | `GET /api/providers/<id>/teams` | `Team[]` |
| `signIns.start(kind, provider?)` | `POST /api/sign-ins` | `SignIn` |
| `signIns.get(id)` | `GET /api/sign-ins/<id>` | `SignInStatus` |
| `signIns.cancel(id)` | `DELETE /api/sign-ins/<id>` | `{ ok: true }` |

A device code sign-in: show `userCode` and `verificationUrl`, then call `signIns.get` until the status is `done` or `failed`.

### Library

| Call | Route | Returns |
| --- | --- | --- |
| `library.list({ q?, profileId?, kind?, before?, limit? })` | `GET /api/library?q=&profile=&kind=&before=&limit=` | `LibraryPage` |
| `library.get(id)` | `GET /api/library/<id>` | `LibraryItem` |
| `library.remove(id)` | `DELETE /api/library/<id>` | `{ ok: true }` |

A file itself is read through its item's `url`, `/api/library/<id>/file`.

### Plugins and OAuth

| Call | Route | Returns |
| --- | --- | --- |
| `plugins.list()` | `GET /api/plugins` | `Plugin[]` |
| `plugins.search(q, { kind?, everything? })` | `GET /api/plugins/search?q=&kind=&everything=1` | `McpSearch` |
| `plugins.searchSkills(q)` | `GET /api/plugins/search?q=&kind=skill` | `SkillSearch` |
| `plugins.preview(ref)` | `POST /api/plugins/preview` | `SkillPreview` for a skill ref, `PackagePreview` for a repo ref, else `McpPreview` |
| `plugins.add(ref, hash)` | `POST /api/plugins` | `Plugin` |
| `plugins.update(id, hash)` | `POST /api/plugins/<id>/update` | `Plugin` |
| `plugins.change(id, fields)` | `PATCH /api/plugins/<id>` | `Plugin` |
| `plugins.remove(id)` | `DELETE /api/plugins/<id>` | `{ ok: true }` |
| `plugins.setSecrets(id, secrets)` | `PUT /api/plugins/<id>/secrets` | `Plugin` |
| `plugins.forBot(profileId, pluginId, enabled)` | `PUT /api/profiles/<profileId>/plugins/<pluginId>` | `Plugin` |
| `plugins.readSkill(id, file?)` | `GET /api/plugins/<id>/skills?file=` | `string` |
| `plugins.signIn(id)` | `POST /api/plugins/<id>/sign-in` | `OAuthAttempt` |
| `plugins.searchPackages(q)` | `GET /api/plugins/search?q=&kind=package` | `PackageSearch` |
| `plugins.configure(id, settings)` | `PUT /api/plugins/<id>/settings` | `PackagePlugin` |
| `plugins.log(id)` | `GET /api/plugins/<id>/log` | `string[]` |
| `plugins.pages()` | `GET /api/plugins/pages` | `PluginPage[]` |
| `oauth.get(attemptId)` | `GET /api/oauth/attempts/<attemptId>` | `OAuthStatus` |
| `oauth.paste(attemptId, address)` | `POST /api/oauth/attempts/<attemptId>/paste` | `OAuthStatus` |

After `plugins.signIn`, open the attempt's `url`, then call `oauth.get` until the status is `done` or `failed`. The browser's `Origin` decides where the sign-in comes back to.

## stream

```ts
stream(id: string, options?: { cursor?: number; signal?: AbortSignal; onConnection?: (connected: boolean) => void }): AsyncGenerator<StreamLine>
```

| Option | Default | What it does |
| --- | --- | --- |
| `cursor` | `0` | Where to start. 0 replays the whole chat. |
| `signal` | None | Stops the stream. The generator then returns. |
| `onConnection` | None | Hears `true` on each connection, and `false` when one drops |

- It yields every line of the bot's chat from `cursor` on, then each new line, until `signal` aborts.
- It keeps the `cursor` of the last line it read. When the connection drops, the server answers with an error, or the stream ends, it waits 2 seconds and asks again from that cursor. The server ends the stream at once for a bot with no chat yet, so the client asks again every 2 seconds until the chat starts.
- It hides a line whose `epoch` is lower than one it has already seen, as libfx's rule says.
- Each connection's `x-fxbot-version` header goes to `onVersion`.

## applyLine

`applyLine(turns, line)` folds one stream line into a list of turns, one per message, and returns a new list. It doesn't change the list it was given.

| Line | What it changes |
| --- | --- |
| A line without `messageId`, such as `idle` | Nothing |
| `turn_start`, `turn_resume` | Moves the turn to the end of the list and starts it again: an empty `reply` and `parts`, `done: false`, and no `note` or `unsent`. `text` comes from the line's `input` when it is a string, and `files` from the line's `files`. A turn that runs again after a crash sends its reply again from the start. |
| `text_delta` | Adds `delta` to `reply`, and to the last part when it is text, or else to a new text part. Separate text parts are joined in `reply` with a blank line. |
| `reasoning_delta` | Adds `delta` to the last part when it is reasoning, or else to a new reasoning part |
| `tool_start` | Adds a tool part with its `id`, `name`, and `input`, or `inputPreview` for a large input |
| `tool_end` | Ends the tool part of the same `id`, with `output` from `content` and `error` from `isError`. A tool that started before the replay's cursor is added here. |
| `turn_end` | Sets `done`. `note` is `Error: <message>` for an error, or `Stopped: <stopReason>` when the reason isn't `end_turn`. A tool still running is marked done. |
| Any other type | Nothing |

A line for a message not in the list adds a turn for it.

## Types

```ts
type Turn = {
  messageId: string;
  text: string; // the message
  files?: Upload[];
  reply: string; // the reply's text alone
  parts?: Part[]; // the reply step by step, in order
  done: boolean;
  note?: string; // an error, or why it stopped
  unsent?: boolean; // for a page: a message the server never took
};

type Part =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; input?: unknown; inputPreview?: string; output?: string; error?: boolean; done: boolean };
```

A turn from `profiles.earlier` has `reply` and no `parts`.

## Stream lines

`StreamLine` is one line of a bot's NDJSON stream, as far as fxbot reads it. libfx writes more types and fields.

| Field | Type | What it is |
| --- | --- | --- |
| `type` | `string` | The line's type |
| `messageId` | `string` | The turn it belongs to |
| `input` | `unknown` | The message on `turn_start`, or a tool's arguments on `tool_start` |
| `files` | `Upload[]` | A message's files, on `turn_start` |
| `delta` | `string` | New text, on `text_delta` and `reasoning_delta` |
| `id` | `string` | A tool call's id, which pairs `tool_start` with `tool_end` |
| `name` | `string` | A tool's name |
| `inputPreview` | `string` | A preview of a tool's input, in place of a large `input` |
| `content` | `string` | A tool's result, on `tool_end` |
| `isError` | `boolean` | Whether the tool failed, on `tool_end` |
| `stopReason` | `string` | Why the turn ended, on `turn_end`, such as `end_turn` |
| `error` | `{ message: string }` | Why the turn failed, on `turn_end` |
| `cursor` | `number` | Where to start again to get the lines after this one |
| `epoch` | `number` | The lease epoch of the line's writer |

The types `applyLine` reads:

| Type | When |
| --- | --- |
| `turn_start` | A turn starts |
| `turn_resume` | A turn a stopped process left open runs again |
| `text_delta` | More of the reply's text |
| `reasoning_delta` | More of the model's reasoning |
| `tool_start` | A tool call starts |
| `tool_end` | A tool call ends |
| `turn_end` | A turn ends |

libfx writes other types too, such as `turn_yield` and `idle`. `applyLine` passes over them.

## Exports

| Export | What it is |
| --- | --- |
| `createClient` | Makes a client |
| `applyLine` | Folds a stream line into a list of turns |
| `unreachable` | `"Cannot reach the server."`, the message of a call that got no answer |
| `colors`, `shapes`, `kinds`, `itemKinds`, `embeddingKinds`, `maxPinned` | The same tables as `@fxbot/sdk`'s. See [Exports](/sdk/reference/server-api/#exports). |

The types are `Client`, `ClientOptions`, `StreamOptions`, `Turn`, and `Part`, and the shared types that `@fxbot/sdk` exports too, such as `Profile`, `Provider`, `Settings`, and `StreamLine`.
