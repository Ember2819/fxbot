---
title: "HTTP API"
description: "The routes fxbot's server answers under /api. Each one calls the fxbot object, which has the rules for its input."
---

The routes fxbot's server answers under `/api`. Each one calls [the fxbot object](/sdk/reference/server-api/), which has the rules for its input.

For typed calls from a page or a script, use [the client](/sdk/reference/client/).

## Rules

- The server listens on `FXBOT_HOST`, default `127.0.0.1`, at `FXBOT_PORT`, default 8787. See [Configuration](/docs/reference/configuration/).
- Every answer has the header `x-fxbot-version`, the running version.
- A write, any method but `GET` and `HEAD`, whose `Origin` header names another host than the request's `Host` header gets 403, `{ "error": "This request came from another site." }`. A request with no `Origin` header, such as one from `curl` or Node's `fetch`, passes. The server sends no CORS headers.
- A route that reads a body takes a JSON object. Anything else gets 400, "body must be a JSON object". A body is at most 1 MiB, and a message's at most 12 MiB. A larger one gets 413.
- An error comes back as JSON, `{ "error": "<message>" }`, with the SDK's `status`, or 500 for an unexpected one, which the server logs. An error after an answer has started, as in a stream, closes the connection.
- A path or method the server doesn't serve gets 404, `not found`, or 405, `method not allowed`.
- A bot id is 12 hex characters. Most routes under `/api/profiles/<id>` get 400 for another shape, and 404 for an unknown bot.

## Status codes

| Status | When |
| --- | --- |
| 200 | Done |
| 201 | Made: a bot, a memory, a provider, a sign-in, a plugin, or an OAuth sign-in |
| 202 | An update was asked for |
| 304 | A library file whose ETag matches `If-None-Match` |
| 400 | Bad input, or a request fxbot refuses |
| 403 | A write from another site |
| 404 | No such route, or a missing bot, provider, memory, library item, plugin, or sign-in |
| 405 | A method the path doesn't take |
| 409 | A plugin changed since its preview, a skill is already added, or an update is running |
| 413 | A body over its limit |
| 500 | An unexpected error |
| 502 | A service fxbot asked failed |

## Health and updates

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/health` | | `{ "ok": true, "version": "<version>" }` |
| `GET` | `/api/update` | | `UpdateStatus` |
| `POST` | `/api/update` | | 202 and `UpdateStatus`. Asks the machine to update to the newest release the check found. |

`UpdateStatus` is `{ version, latest, canUpdate, updating }`. `canUpdate` is true only in an install made by `setup.sh`, where `FXBOT_CONTROL` is set. `updating` is `{ to, steps, error? }` while an update runs, or after one failed, else `null`. `POST` gets 400 outside such an install, and when the running version is the newest, and 409 while an update runs.

## Plugins

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/plugins` | | `Plugin[]` |
| `GET` | `/api/plugins/search` | `q`, `kind` (`mcp`, `skill`, or `package`), `everything=1` | `McpSearch`, `SkillSearch` for `kind=skill`, or `PackageSearch` for `kind=package` |
| `POST` | `/api/plugins/preview` | `{ "ref": PluginRef }` | `McpPreview`, `SkillPreview` for a skill, or `PackagePreview` for a package |
| `POST` | `/api/plugins` | `{ "ref": PluginRef, "hash": "<preview's hash>" }` | 201 and `Plugin` |
| `POST` | `/api/plugins/<id>/update` | `{ "hash": "<preview's hash>" }` | `Plugin` |
| `PATCH` | `/api/plugins/<id>` | Any of `enabled`, `bots` (`all` or `each`), `allowed` (tool names) | `Plugin` |
| `DELETE` | `/api/plugins/<id>` | | `{ "ok": true }` |
| `PUT` | `/api/plugins/<id>/secrets` | Any of `headers` (name to value), `clientId`, `clientSecret` | `Plugin` |
| `GET` | `/api/plugins/<id>/skills` | `?file=`, default `SKILL.md` | `{ "text": "<file>" }` |
| `POST` | `/api/plugins/<id>/sign-in` | | 201 and `OAuthAttempt`. The request's `Origin` is where the sign-in comes back to. |
| `PUT` | `/api/plugins/<id>/settings` | A package's settings, name to value, `""` for its default | `PackagePlugin`. Secrets never come back. |
| `GET` | `/api/plugins/<id>/log` | | `{ "lines": [...] }`, a package's recent log |
| `GET` | `/api/plugins/<id>/contents` | | `PackagePreview`, an installed package's page, from the files it runs |
| `GET` | `/api/plugins/pages` | | `PluginPage[]`: each running package's page code and CSS, by URL |
| `GET` | `/api/plugins/<name>/files/<path>` | | A package's page code or CSS, and nothing else of its files. A pinned package's is kept for good, under its commit. |
| Any | `/api/plugins/<name>/<path>` | | The package's own route. See [Plugin API](/sdk/reference/plugin-api/#routes). |
| `PUT` | `/api/profiles/<id>/plugins/<pluginId>` | `{ "enabled": true }` | `Plugin`. Turns the plugin on or off for one bot. |

`PluginRef` is `{ url, transport?, headers?, allowLocal? }`, `{ registry, version?, allowLocal?, from? }`, `{ skill, from? }`, or `{ repo, from? }`: see [Plugins](/sdk/reference/server-api/#plugins).

A plugin's id is 12 hex characters, and anything else after `/api/plugins/` that isn't `pages`, `search`, or `preview` is a package's name. Until Settings' `unvetted` is true, search answers only from fxbot's lists, and preview and add refuse anything else with 400.

## OAuth

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/oauth/callback` | The authorization server's `?state=&code=` | An HTML page: 200, "Connected. You can close this tab.", or 400, "Sign-in failed: …" |
| `GET` | `/api/oauth/attempts/<attemptId>` | | `OAuthStatus` |
| `POST` | `/api/oauth/attempts/<attemptId>/paste` | `{ "address": "<the page's address>" }` | `OAuthStatus` |

`GET /callback`, outside `/api`, answers the same page, for a loopback redirect to the server's own port on this machine.

## Settings

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/settings` | | `Settings` |
| `PATCH` | `/api/settings` | Any of `defaultProvider`, `defaultProfile`, `unvetted`, `timeZone`, `embedder`, `embeddingProvider`, `embeddingModel`, `messageVectors`, and `local` | `Settings` |
| `GET` | `/api/settings/embedding` | | `EmbeddingStatus` |

- `local` is `cpu`, `gpu`, or `off`. It asks the machine to run its local embedder that way. Outside an install made by `setup.sh`, it gets 400.
- `EmbeddingStatus` adds what the machine runs to the SDK's status. `local` is the machine's embedder, or `null` outside an install made by `setup.sh`. `switching` is a change it hasn't finished, or why one failed. `canSwitch` is whether `local` can be asked for. When the machine runs no embedder while Settings asks for `local`, `error` says so.

## Providers

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/providers` | | `Provider[]` |
| `POST` | `/api/providers` | `NewProvider`: `kind`, and any of `name`, `baseUrl`, `apiKey`, `model`, `contextWindow` | 201 and `Provider` |
| `PATCH` | `/api/providers/<id>` | Any of `name`, `baseUrl`, `apiKey`, `model`, `contextWindow`, `teamId` | `Provider` |
| `DELETE` | `/api/providers/<id>` | | `{ "ok": true }` |
| `GET` | `/api/providers/<id>/models` | | `Model[]` |
| `GET` | `/api/providers/<id>/teams` | | `Team[]` |

A key goes up in `apiKey`. No answer carries it: a `Provider` has `hasKey` and `signedIn`.

## Sign-ins

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `POST` | `/api/sign-ins` | `kind`: `chatgpt`, `grok`, or `vercel`. `provider`, optional: a provider of that kind to sign in again. | 201 and `SignIn`: `{ id, verificationUrl, userCode, expiresAt }` |
| `GET` | `/api/sign-ins/<id>` | | `SignInStatus`: `{ status, provider?, error? }`, with `status` `waiting`, `done`, or `failed` |
| `DELETE` | `/api/sign-ins/<id>` | | `{ "ok": true }` |

## Library

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/library` | `q`, `profile` (a bot id), `kind` (`image` or `document`), `before` (a page's `next`), `limit` (1 to 100, default 60) | `LibraryPage`: `{ items, next }` |
| `GET` | `/api/library/<id>` | | `LibraryItem` |
| `DELETE` | `/api/library/<id>` | | `{ "ok": true }` |
| `GET` | `/api/library/<id>/file` | `?download=1` | The file's bytes |
| `GET` | `/api/profiles/<id>/uploads/<sha256>.<ext>` | | The bytes of an image, at its address from before the library |

A file's answer has these headers:

| Header | Value |
| --- | --- |
| `content-type` | An image's type, or `text/plain; charset=utf-8` for every document |
| `x-content-type-options` | `nosniff` |
| `content-security-policy` | `default-src 'none'; style-src 'unsafe-inline'; sandbox` |
| `cache-control` | `private, no-cache` |
| `etag` | The SHA-256 of its bytes, in quotes. A matching `If-None-Match` gets 304 with no body. |
| `content-disposition` | With `?download=1`: `attachment`, with the item's name |

## Bots

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `GET` | `/api/profiles` | | `Profile[]` |
| `POST` | `/api/profiles` | `name`, and any of `instructions`, `model`, `provider`, `shape`, `color` | 201 and `Profile` |
| `GET` | `/api/profiles/<id>` | | `Profile` |
| `PATCH` | `/api/profiles/<id>` | Any of the fields, and `pinned` | `Profile` |
| `DELETE` | `/api/profiles/<id>` | | `{ "ok": true }` |
| `POST` | `/api/profiles/<id>/stop` | | `{ "ok": true }`. Stops the turn running in the bot's own chat, if one runs. Since 0.6.0. |
| `GET` | `/api/profiles/<id>/earlier` | | `Turn[]`: the chats before the current one |
| `GET` | `/api/profiles/<id>/skills` | | `BotSkill[]`: the bot's skills, then its plugins' commands, with `command: true` |
| `GET` | `/api/profiles/<id>/memories` | `?query=&limit=` | `Memory[]` |
| `POST` | `/api/profiles/<id>/memories` | `{ "text": "<fact>" }` | 201 and `Memory` |
| `PATCH` | `/api/profiles/<id>/memories/<memoryId>` | `{ "text": "<fact>" }` | `Memory` |
| `DELETE` | `/api/profiles/<id>/memories/<memoryId>` | | `{ "ok": true }` |

## Chat

| Method | Path | Body or query | Answer |
| --- | --- | --- | --- |
| `POST` | `/api/profiles/<id>/messages` | `Message`: `text`, `messageId`, and optional `files`, each `{ name, type, data }` with `data` in base64. At most 12 MiB. | `{ messageId, sessionId }`, once the message is stored |
| `GET` | `/api/profiles/<id>/stream` | `cursor`, default 0, and `session`, the session the cursor is in | NDJSON lines, from the cursor on, then each new one, and `{"type":"moved","sessionId":"<new>"}` last when the chat starts over. A `session` the chat has moved from answers that line alone. |

The stream:

- answers 200 with `content-type: application/x-ndjson` and `cache-control: no-store`, the `x-fxbot-version` header, and `x-fxbot-end`, the cursor of the chat's newest line when the stream opened. The lines up to it are the replay.
- is gzipped, flushed after each line, when the request accepts gzip
- replays the chat's lines from `cursor`, then stays open for new ones. 0 replays the whole chat. Each line's `cursor` is where to ask again to get the lines after it.
- ends at once for a bot with no chat yet, or whose provider is gone
- stops when the client closes the connection
- gets 400 for a `cursor` that isn't a whole number

The lines' fields are in [Stream lines](/sdk/reference/client/#stream-lines).

```sh
curl -N "http://127.0.0.1:8787/api/profiles/<id>/stream?cursor=0"
```

## Outside /api

`GET /callback` finishes an MCP sign-in, as above. A `GET` or `HEAD` of every other path serves the page from `packages/ui/dist/`: the file at that path, or `index.html`, so the app's routes load. Any other method gets 405. Without a build, it gets 404, `{ "error": "no build in packages/ui/dist/; run npm run build" }`.
