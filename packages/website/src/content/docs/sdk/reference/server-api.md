---
title: "The fxbot object"
description: "What createFxbot resolves to: every call on bots, chats, providers, settings, the library, and plugins."
---

What [`createFxbot`](/sdk/reference/create-fxbot/) resolves to: every call on bots, chats, providers, settings, the library, and plugins.

Every call returns a promise, unless its row says it is synchronous. A call that fails throws an `Error` with a `status`, as in [Errors](/sdk/reference/create-fxbot/#errors). A bot id is 12 hex characters: another shape fails with 400, and an unknown bot with 404.

## Bots

| Call | What it does | Returns |
| --- | --- | --- |
| `profiles.list()` | Every bot: the pinned ones first, in the order they were pinned, then the rest by name. Each has `isDefault`, true for the bot a launch at `/` opens (Settings' `defaultProfile`). | `Profile[]` |
| `profiles.get(id)` | One bot | `Profile` |
| `profiles.create(fields)` | A new bot. Only `name` is required. `provider` defaults to Settings' `defaultProvider`. The first bot starts pinned. | `Profile` |
| `profiles.update(id, update)` | Changes any of the fields, and `pinned` | `Profile` |
| `profiles.stop(id)` | Stops the turn running in the bot's own chat, whoever started it. A message it hadn't read runs next. Since 0.6.0. | nothing |
| `profiles.remove(id)` | Removes the bot, its messages, and its memories. Its library items stay, with `null` for the bot. Its libfx session stays in the database. | nothing |
| `profiles.earlier(id)` | The bot's chats before its current one, which a provider switch leaves behind, as finished turns, oldest first: the newest 400 messages of them. `Turn` is the client's type. | `Turn[]` |
| `profiles.skills(id)` | The skills the bot has, for a `$` and `/` picker, then the commands of the plugins on for it, with `command: true` | `BotSkill[]` |

The fields of a bot:

| Field | Rules | Default on create |
| --- | --- | --- |
| `name` | Trimmed, 1 to 200 characters | Required |
| `instructions` | Up to 64 KiB | `""` |
| `provider` | A provider id, or `""` for none. An unknown id fails with 404. | Settings' `defaultProvider` |
| `model` | Trimmed, up to 200 characters. `""` follows the provider's default model. | `""` |
| `shape` | One of `shapes` | `circle` |
| `color` | A key of `colors` | `brown` |

Other keys are ignored. An update also takes `pinned`:

- `pinned: true` fails with 400 when `maxPinned` (3) bots are pinned already.
- A new `provider` without a new `model` sets `model` to `""`.
- A new provider for a bot with a chat compacts the chat. The old provider summarizes it, or, when it can't, the new one summarizes the stored messages. The bot starts a new chat from that summary, its `handoff`, and the old chat moves to `earlier`. This fails with 400 when the old provider can't summarize and the new one has no model, and with 502 when neither provider could summarize.
- `provider: ""` fails with 400 for a bot with a chat.

### Memories

| Call | What it does | Returns |
| --- | --- | --- |
| `profiles.memories.list(id, { query?, limit? })` | The bot's memories, newest first. With `query`, the best matches, by words and, with an embedder, by meaning. `limit` is 1 to 500, default 200. | `Memory[]` |
| `profiles.memories.add(id, text)` | Adds a memory, saved by the owner. The text is trimmed, 1 to 1,000 characters. The same text again, ignoring case and extra spaces, returns the memory already there. | `Memory` |
| `profiles.memories.update(id, memoryId, text)` | New text for a memory. If another memory already says it, the two merge: this one is removed, and the other is returned. | `Memory` |
| `profiles.memories.remove(id, memoryId)` | Removes a memory | nothing |

`memoryId` is a memory's `id`, or `mem:<id>`. An unknown one fails with 404. See [Work with memories](/sdk/how-to/memories/).

## Chat

| Call | What it does | Returns |
| --- | --- | --- |
| `send(id, message)` | Sends a message to the bot. It resolves once libfx has stored the prompt. The reply arrives on the stream. | `{ messageId, sessionId }` |
| `stream(id, cursor = 0, session?)` | Every line of the bot's chat from `cursor` on, as NDJSON, then each new line. Cancel the stream to stop it. When the chat starts over, by a provider switch or a plugin's `startOver`, the stream ends with `{"type":"moved","sessionId":"<new>"}`. `session` is the session `cursor` is in: one the chat has moved from answers that line alone. | `ReadableStream<Uint8Array>` |
| `streamEnd(id)` | The cursor of the newest line in the bot's chat, 0 for none. A stream opened after it replays up to that cursor, then follows. | `number` |

`send` takes a `Message`:

- `text` is required, unless the message has files.
- `messageId` is 1 to 128 letters, digits, `.`, `_`, or `-`. The same `messageId` again reaches the same turn and runs nothing new.
- `files` is up to 8 `{ name, type, data }`, with `data` in base64. An image is PNG, JPEG, GIF, or WebP, checked by its bytes: at most 3.75 MiB each, and 6 MiB for a message's images together. Any other file must be UTF-8 text with no NUL. It goes to the model as text, under its name. Every file is saved to the library, tagged with the bot and its chat.
- `$name` anywhere in the text, or `/name` at its start, names one of the bot's skills. That skill's instructions go with the message.
- It fails with 400 when the bot has no provider, or no model of its own and no default model on its provider.
- The first message starts the bot's chat and sets its `sessionId`.

`stream`:

- A line is one of libfx's stream lines. Its fields are the client's [`StreamLine`](/sdk/reference/client/#stream-lines).
- A `turn_start` for a message with files or skills carries the `input` and `files` that fxbot saved, which libfx's line lacks.
- `cursor` is a whole number, or the call fails with 400. 0 replays the whole chat. Each line's `cursor` is where to start again to get the lines after it.
- For a bot with no chat yet, or whose provider is gone, the stream ends at once.

See [Stream replies](/sdk/how-to/stream-replies/).

## Providers

The kinds are in [Providers](/docs/reference/providers/) and the `kinds` table.

| Call | What it does | Returns |
| --- | --- | --- |
| `providers.list()` | Every provider, in the order they were added. `hasKey` and `signedIn` say whether it holds a key or a sign-in, not what it is. | `Provider[]` |
| `providers.add(input)` | A provider of a key kind or a server kind. A key is checked with the provider first. | `Provider` |
| `providers.update(id, input)` | Changes `name`, `model`, `apiKey`, `baseUrl` (server kinds), `contextWindow` (server kinds), or `teamId` (a Vercel account) | `Provider` |
| `providers.remove(id)` | Removes the provider. It fails with 400 while bots use it. When it was Settings' `defaultProvider` or `embeddingProvider`, that becomes `""`. | nothing |
| `providers.models(id)` | The provider's models, and what fxbot knows of each | `Model[]` |
| `providers.teams(id)` | A Vercel account's teams. Other kinds fail with 400. | `Team[]` |

`providers.add` takes a `NewProvider`:

- `kind` is a key kind or a server kind. `chatgpt`, `grok`, and `vercel` are added by signing in, and fail here with 400.
- `baseUrl` is fixed for a key kind. A server kind takes one, or uses its default, and `custom` needs one. It is `https`, or `http` on `localhost`, `127.0.0.1`, or `[::1]`, with no credentials, query, or fragment.
- `apiKey` is required for a key kind, optional for `custom`, and up to 4,096 characters. The check lists the provider's models with it. A 401 or 403 fails with 400, "The provider rejected this key." A 404 passes.
- `name` defaults to the kind's label. `model` is the default model for the provider's bots. `contextWindow` is for server kinds only: a whole number of tokens, or `null`. It overrides what the server reports.

`providers.update` fails with 400 for `apiKey` on a kind that signs in, and for `baseUrl` on a kind that isn't a server. A new key, address, or team drops the kept model list.

### Sign-ins

A device code sign-in adds a ChatGPT plan, a Grok plan, or a Vercel account. See [Connect providers](/sdk/how-to/providers/).

| Call | What it does | Returns |
| --- | --- | --- |
| `signIns.start({ kind, provider? })` | Starts a sign-in for `chatgpt`, `grok`, or `vercel`. With `provider`, it signs that provider in again. One runs at a time: a new one replaces one that waits. It fails with 502 when the service gives no code. | `SignIn` |
| `signIns.get(id)` | Synchronous. The sign-in's status. It fails with 404 for a sign-in that isn't the latest one. When it is `done`, `provider` is the provider's id. | `SignInStatus` |
| `signIns.cancel(id)` | Synchronous. Stops a sign-in that waits. | nothing |

A new Vercel account with one team gets that team.

## Settings

| Call | What it does | Returns |
| --- | --- | --- |
| `settings.get()` | The settings | `Settings` |
| `settings.update(input)` | Changes any of the fields, and returns them all | `Settings` |
| `settings.embedding()` | How far memory search's vectors have got | `{ model, error, messages, withVectors, memories, memoriesWithVectors }` |

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| `defaultProvider` | `string` | `""` | The provider new bots start on, or `""` for none |
| `timeZone` | `string` | `""` | The owner's time zone, such as `Europe/Berlin`, which plugins read. `""` is the machine's. Since 0.6.0. |
| `turnsAtOnce` | `number` | `32` | How many turns run at once, across every bot and chat, from 4 to 100. Read when fxbot starts. Since 0.6.0. |
| `defaultProfile` | `string` | `""` | The bot whose chat a launch at `/` opens, or `""` for none. A bot's id: an id of another shape fails with 400, and an unknown one with 404. Deleting the bot clears it. Since 0.5.0. |
| `unvetted` | `boolean` | `false` | Whether plugins fxbot doesn't vet can be found and added: the public registries, and adding by address or repository |
| `embedder` | `"local"`, `"remote"`, or `"off"` | `"local"` | Where memory search's vectors come from: `embedUrl`, a provider's `/embeddings`, or none |
| `embeddingProvider` | `string` | `""` | For `remote`: a provider whose kind is in `embeddingKinds` |
| `embeddingModel` | `string` | `""` | For `remote`: the model's id, up to 200 characters |
| `messageVectors` | `number` | `8000` | How many characters of each message get a vector, 0 to 100,000. 0 embeds no messages. |

- `remote` needs both `embeddingProvider` and `embeddingModel`, or the update fails with 400.
- A new remote source embeds a test string first. If that fails, the update fails with 400, and the old settings stay.
- A change to memory search's fields starts filling in vectors again, in the background.

`settings.embedding()` gives the model in use, or `null` when vectors are off or the embedder doesn't answer, the fill-in's last `error`, and the counts. fxbot's server adds `local`, `switching`, and `canSwitch`, which make an `EmbeddingStatus`.

## Library

| Call | What it does | Returns |
| --- | --- | --- |
| `library.list(query)` | Items, newest saved first. `q` searches names and document text, and every word must match. `profileId` narrows to one bot, and `kind` to `image` or `document`. `limit` is 1 to 100, default 60. `before` is a page's `next`. Pass `{}` for all. | `LibraryPage` |
| `library.get(id)` | One item | `LibraryItem` |
| `library.file(id, ifNoneMatch?)` | The item's bytes as `data`, with its `name`, `kind`, `type`, and `sha256`. `data` is `null` when `ifNoneMatch` names the SHA-256 in quotes, as an ETag. | `{ name, kind, type, sha256, data }` |
| `library.upload(id, name, ifNoneMatch?)` | The same, for an image's address from before the library: a bot id, and `<sha256>.<ext>` with `png`, `jpg`, `gif`, or `webp` | `{ name, kind, type, sha256, data }` |
| `library.remove(id)` | Removes the one copy, for every bot it is tagged with | nothing |

An item's `url` is `/api/library/<id>/file`, a route of fxbot's server.

## Plugins

A plugin carries any mix of code, MCP servers, and skills. Each is one of three kinds of record: `mcp`, an MCP server; `skill`, one skill; and `package`, a folder with `plugin.json`, whose code, skills, and servers come with it. See [Give bots tools](/sdk/how-to/tools/), and for packages, [Plugin API](/sdk/reference/plugin-api/).

Until Settings' `unvetted` is true, search answers only from fxbot's own lists and asks no registry, and `preview` and `add` take only refs in those lists, failing with 400 for anything else.

| Call | What it does | Returns |
| --- | --- | --- |
| `plugins.list()` | Every plugin. A server from a registry carries that entry's `info`, and a `mark` when it has a newer version, or is deprecated or gone. A skill or a package carries the `mark` of the hourly check. A package lists the servers it added in `servers`. Each plugin, and each card of a search, has `iconKey`, `creator/name`, which `pluginIcon` from `@fxbot/sdk/client` draws. | `Plugin[]` |
| `plugins.search(q, options)` | Up to 20 servers from fxbot's list and the mirror of GitHub's registry. `{ everything: true }` adds the official registry's results, for 3 characters or more. `{ kind: "skill" }` searches skills instead: fxbot's list, then skills.sh for 2 characters or more. `options` is required: pass `{}` for servers. | `McpSearch` or `SkillSearch` |
| `plugins.preview(ref)` | A plugin's page, with a `hash`. For a server, what probing it found. For a skill or a package, its files at its repository's current commit. | `McpPreview`, `SkillPreview`, or `PackagePreview` |
| `plugins.add(ref, hash)` | Adds what the preview showed. It fails with 409 when that changed since, or the skill is already added. | `Plugin` |
| `plugins.update(id, hash)` | Moves a registry server or a skill to the newer definition its page showed. It fails with 409 when that changed since. | `Plugin` |
| `plugins.change(id, input)` | Sets `enabled`, `bots` (`"all"`, or `"each"` for chosen bots), and for a server, `allowed`: the names of the tools bots get. A package's servers follow its `enabled` and `bots`. | `Plugin` |
| `plugins.remove(id)` | Removes the plugin | nothing |
| `plugins.setSecrets(id, secrets)` | A server's header values, or the owner's own OAuth `clientId` and `clientSecret`. Write-only. | `Plugin` |
| `plugins.forBot(profileId, pluginId, enabled)` | Turns a plugin on or off for one bot. It counts when the plugin's `bots` is `"each"`, and a package's servers follow. | `Plugin` |
| `plugins.readSkill(id, file?)` | Synchronous. One of an installed skill's files, `SKILL.md` by default. | `string` |
| `plugins.check()` | Runs the hourly check of the skills' and packages' repositories now | nothing |
| `plugins.configure(id, settings)` | A package's settings: a value for each one named, or `""` for its default. Secrets are write-only. | `PackagePlugin` |
| `plugins.log(id)` | Synchronous. A package's recent log lines and errors | `string[]` |
| `plugins.contents(id)` | An installed package's page, read from the files it runs: its commit's for one from GitHub, its folder for a local one, whose `source` is `{ local }`. It throws 404 for an id that isn't a package. Since 0.5.0. | `PackagePreview` |
| `plugins.pages()` | The running packages' page code and CSS, by URL, for the page | `PluginPage[]` |
| `plugins.file(name, path)` | A running package's page code or CSS, and nothing else of its files. `pinned` says its URL names a commit. | `{ type, data, pinned }` |
| `plugins.handle(name, request, path)` | Answers a request to `/api/plugins/<name>/<path>` with the package's route | `Response` |

`createFxbot` takes `pluginDirs`: package folders that load at start, for writing a package.

A `PluginRef` is one of:

| Ref | What it names |
| --- | --- |
| `{ url, transport?, headers?, allowLocal? }` | A server by its address. `transport` is `streamable-http` (default) or `sse`. `headers` names the headers it needs. The address is `https`. A local or private address needs `allowLocal`, and may then use `http`. |
| `{ registry, version?, allowLocal?, from? }` | A registry entry, from `github` (default), `fxbot`, or `official` |
| `{ skill, from? }` | A skill, as `<owner>/<repo>/<skillId>` |
| `{ repo, from? }` | A package, as `<owner>/<repo>` or `<owner>/<repo>/<folder>`, from `github` (default) or `fxbot` |

A server's `allowed` starts as its read-only tools. A header value is one line, up to 8 KiB, for a header the server was added with.

### OAuth

`oauth` signs in to a server whose `auth` is `oauth`.

| Call | What it does | Returns |
| --- | --- | --- |
| `oauth.start(id, origin?)` | Starts a sign-in, which expires in 10 minutes. With `mode: "redirect"`, the browser comes back to `<origin>/api/oauth/callback`, for an HTTPS `origin`. With `mode: "paste"`, it comes back to `<localUrl>/callback`, and the person pastes that address when the page doesn't load. A new sign-in to the same server replaces one that waits. | `OAuthAttempt` |
| `oauth.get(attemptId)` | Synchronous. The sign-in's status. | `OAuthStatus` |
| `oauth.paste(attemptId, address)` | Finishes a sign-in with the address the person pasted | `OAuthStatus` |
| `oauth.callback(query)` | Finishes a redirect, from its query string as `URLSearchParams` | `OAuthStatus` |

`origin` is the page's origin, which the server has checked against its own host.

## Release and close

| Call | What it does | Returns |
| --- | --- | --- |
| `release()` | Synchronous. The running `version`, and `latest`, the newest stable release when it is newer, or `null` | `{ version, latest }` |
| `close()` | Closes the agents, which waits for their running turns, and waits for their replies to be saved, then stops the plugins, the timers, and the MCP connections, and ends the Postgres connection. See [Stopping](/sdk/reference/create-fxbot/#stopping). | nothing |

## Tools every bot gets

Every agent has these tools. Each one acts for the bot whose chat runs it.

| Tool | What it does |
| --- | --- |
| `chat_history` | Searches the bot's history in all of its chats: messages, thinking, and tool calls with their results, since 0.6.0, by words, and messages by meaning too when message vectors are on. With `around`, a `msg:<id>`, it reads that message and up to 6 on each side, in full. |
| `memory_save` | Saves one fact, up to 1,000 characters. With `replaces`, a `mem:<id>`, it changes that memory instead. |
| `memory_search` | Searches the bot's memories by words and, with an embedder, by meaning: up to 20 |
| `memory_forget` | Removes a memory by its `mem:<id>` |
| `library_search` | Searches the items tagged with the bot, by name and document text. An empty query lists the newest. |
| `library_read` | Opens a `library:<id>`: a document's text, up to 60,000 bytes, or an image |
| `library_save` | Saves a document the bot wrote. The name ends in `.md`, `.txt`, `.csv`, or `.json`, and the text is up to 1 MiB. |
| `skill` | Present while a skill is on. Loads a skill by `name`, one of its files by `file`, in parts of 60 KB, or finds skills by `search`. |
| `<prefix>_<tool>` | Each enabled MCP server's allowed tools. The prefix comes from the server's name or host, such as `linear` for `mcp.linear.app`, and is unique among plugins. For a server set to `each`, a call from a bot it isn't on for fails. |

A bot's instructions on each turn are its own, then its `handoff`, its newest memories in up to 2% of the model's context window, and the list of its skills in up to 1%.

## Exports

From `@fxbot/sdk`, besides `createFxbot`:

| Export | Returns | What it does |
| --- | --- | --- |
| `readKey(text)` | `Buffer` | Decodes the key file's base64 text. It throws unless the key is 32 bytes. |
| `rotateSecrets({ databaseUrl, from, to })` | `number` | Seals every stored secret again, providers' and plugins', from the key `from` to the key `to`, in one transaction, on a connection of its own. Run it with the server stopped. It returns how many it sealed. |
| `compareVersions(a, b)` | `number` | Below zero when `a` is older than `b`. A prerelease comes before its release. It throws for a string that isn't a version. |
| `isVersion(version)` | `boolean` | Whether it is `x.y.z`, with an optional `v` before it and an optional prerelease after a dash, such as `0.4.0-rc.1` |
| `isStable(version)` | `boolean` | Whether it is a version with no prerelease |
| `releasesUrlFor(repository)` | `string` or `undefined` | GitHub's `releases/latest` API address for a `https://github.com/<owner>/<repo>` URL |

| Table | What it holds |
| --- | --- |
| `colors` | A bot's colors, from name to hex: `black`, `brown`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `purple`, `pink`, `gray` |
| `shapes` | A bot's shapes: `circle`, `cloud`, `squircle`, `star`, `clover`, `heart`, `flower`, `egg`, `bean`, `triangle`, `diamond`, `sparkle`, `hexagon`, `pumpkin` |
| `kinds` | Each provider kind's `label`, `connect` (`device`, `key`, or `url`), and `baseUrl` where it is fixed or a default |
| `itemKinds` | `image`, `document` |
| `embeddingKinds` | The provider kinds that serve `/embeddings`: `openai`, `openrouter`, `gateway`, `vercel`, `ollama`, `lmstudio`, `custom` |
| `maxPinned` | 3 |

Every type the calls take or return is exported too, with `FxbotOptions` and `Fxbot`, the type of this object. `Turn` and `Part` come from `@fxbot/sdk/client`.

## Types

```ts
type Fields = { name: string; instructions: string; model: string; provider: string; shape: Shape; color: Color };

type Profile = Fields & {
  id: string;
  sessionId: string | null; // the current chat, from the first message
  preview: string | null; // the start of the latest reply
  handoff: string | null; // the summary a provider switch carried over
  busy: boolean; // a turn runs in this process
  pinned: boolean;
};

type Message = { text: string; messageId: string; files?: Upload[] };
type Upload = { name: string; type: string; url?: string; data?: string }; // data: base64 on the way in

type Provider = {
  id: string;
  kind: Kind;
  name: string;
  baseUrl: string | null;
  model: string;
  contextWindow: number | null;
  teamId: string | null;
  hasKey: boolean;
  signedIn: boolean;
  error: string | null; // why its agent didn't start
};

type Settings = { defaultProvider: string; unvetted: boolean; timeZone: string; turnsAtOnce: number; embedder: "local" | "remote" | "off"; embeddingProvider: string; embeddingModel: string; messageVectors: number };

type EmbeddingStatus = {
  model: string | null;
  error: string | null;
  messages: number;
  withVectors: number;
  memories: number;
  memoriesWithVectors: number;
  local: "cpu" | "gpu" | "off" | null; // from fxbot's server
  switching: { to: "cpu" | "gpu" | "off"; error?: string } | null; // from fxbot's server
  canSwitch: boolean; // from fxbot's server
};

type Memory = {
  id: string;
  text: string;
  savedBy: "bot" | "owner";
  messageId: string | null; // the msg:<id> that chat_history knows, of the turn that saved it
  createdAt: string;
  updatedAt: string;
};
```
