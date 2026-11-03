# createFxbot

`createFxbot(options)`, from `@fxbot/sdk`, opens fxbot's database, brings it up to date, and resolves to [the fxbot object](/sdk/reference/server-api/).

```ts
import { readFileSync } from "node:fs";
import { createFxbot } from "@fxbot/sdk";

const fxbot = await createFxbot({
  databaseUrl: "postgres://fxbot:<password>@127.0.0.1:5432/fxbot",
  secretKey: readFileSync("/path/to/secret.key", "utf8"),
});
```

To add the SDK to a project, see [Use the SDK in a project](/sdk/how-to/set-up/).

## Requirements

| Needs | Why |
| --- | --- |
| Node 22.18 or newer | The package ships TypeScript source, which Node runs without a build. |
| Postgres with the pgvector extension available | Every record lives in Postgres. Migration `0005_memories` creates the `vector` extension when the database lacks it. It stops with a message when the server has no pgvector, or when the extension is missing and fxbot's database role is not a superuser. |
| A key of 32 random bytes, in base64 | It seals every stored key and token. `openssl rand -base64 32` makes one. |
| `pg_dump` and `tar` on the `PATH` | For the backup before migrations, when the database already holds fxbot's records. |

## Options

`FxbotOptions`. Only `databaseUrl` and `secretKey` are required.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `databaseUrl` | `string` | | fxbot's Postgres. Every record lives there. Keys and tokens are stored only sealed. |
| `secretKey` | `Buffer` or `string` | | The 32 bytes that seal keys and tokens: a `Buffer`, or the base64 text of the key file. A key of another length throws. |
| `vercelClientId` | `string` | None | fxbot's Vercel OAuth app, for signing in with a Vercel account. Without it, a Vercel sign-in fails with 400. |
| `dataDir` | `string` | `data` | Where libfx keeps each chat's session files, under `sessions/`. A relative path is taken from the working directory. |
| `backupsDir` | `string` | `backups` | Where a backup goes before migrations change a database in use. |
| `version` | `string` | `0.0.0` | The running version, for `release()`. |
| `releasesUrl` | `string` | None | Where the newest stable release is read, in the shape of GitHub's `releases/latest`. It is read at start and once a day. Without it, nothing is asked. |
| `fetch` | `typeof fetch` | `globalThis.fetch` | The `fetch` for fxbot's own requests: sign-ins, model lists, key checks, MCP servers, the registries, skills, embeddings, and the release check. Turns use libfx's own `fetch`, except on a Vercel account and OpenCode. |
| `localUrl` | `string` | `http://127.0.0.1:8787` | The server's own origin on this machine. An MCP sign-in with a loopback redirect comes back to `<localUrl>/callback`. |
| `clientMetadataUrl` | `string` | None | The project's published OAuth client ID metadata document, for MCP servers that sign in with one. Without it, fxbot registers itself with each server that allows it. |
| `registryUrl` | `string` | `https://api.mcp.github.com` | The MCP registry that registry entries come from. It is mirrored into Postgres for search. |
| `everythingUrl` | `string` | `https://registry.modelcontextprotocol.io` | The official MCP registry. It is asked only when a search asks for everything. |
| `listsUrl` | `string` | `https://fxbot.sh` | The site that publishes fxbot's own lists, `<listsUrl>/mcp-registry.json` and `<listsUrl>/skills-registry.json`. They are read hourly. Until a read succeeds, fxbot uses the lists this release shipped with. |
| `syncRegistry` | `boolean` | `true` | `false` skips the registry sync at start. In 0.3.0, the hourly sync still runs. |
| `embedUrl` | `string` | None | The machine's local embedder, an OpenAI-style API such as `http://embed:8080/v1`, for memory search. Trailing slashes are dropped. Without it, there is no local embedder. |

### How fxbot's server sets them

| Option | From |
| --- | --- |
| `databaseUrl` | `FXBOT_DATABASE_URL` |
| `secretKey` | The file named by `FXBOT_SECRET_KEY_FILE` |
| `vercelClientId` | `FXBOT_VERCEL_CLIENT_ID` |
| `dataDir` | `FXBOT_DATA` |
| `backupsDir` | `FXBOT_BACKUPS` |
| `version` | `version` in the root `package.json` |
| `releasesUrl` | `FXBOT_RELEASES_URL`, or GitHub's `releases/latest` for the repository in the root `package.json`. None when `FXBOT_UPDATE_CHECK` is `off`. |
| `localUrl` | `http://127.0.0.1:<FXBOT_PORT>` |
| `clientMetadataUrl` | `FXBOT_CLIENT_METADATA_URL` |
| `registryUrl` | `FXBOT_MCP_REGISTRY` |
| `everythingUrl` | `FXBOT_MCP_EVERYTHING` |
| `listsUrl` | `FXBOT_LISTS_URL` |
| `embedUrl` | `FXBOT_EMBED_URL` |

The server leaves `fetch` and `syncRegistry` at their defaults. The variables are in [Configuration](/docs/reference/configuration/).

## What it does when called

In order:

1. Reads `secretKey`.
2. Connects to Postgres and runs the migrations it hasn't run. See [Migrations](#migrations). If they fail, it closes the connection and throws.
3. Starts the release check, when `releasesUrl` is set: at once, then once a day.
4. Starts the registry sync, unless `syncRegistry` is `false`: fxbot's two lists and the mirror of `registryUrl`. It runs again every hour.
5. Loads the MCP servers and skills in Add-ons. The skills' repositories are checked for changes a minute after start, then hourly.
6. Starts one libfx agent per provider, each with every bot tool. A provider whose agent doesn't start, such as one whose secret doesn't open, lists with an `error`. The others run.
7. Starts filling in the vectors that memories and messages lack, in the background.
8. Connects the MCP servers, in the background.
9. Resumes the turns a stopped process left open, for each bot with a chat whose provider runs. Each reply is saved as usual.

## Migrations

- The schema is the numbered SQL files in `packages/sdk/src/migrations/`. 0.3.0 has `0001_baseline` to `0005_memories`.
- Each file runs once, in order of its name, and is recorded in the table `fxbot_migrations`.
- All pending files run in one transaction. If one fails, none of them is kept, and the error names it.
- The transaction holds an advisory lock, so two processes that start at once take turns.
- When the database already holds fxbot's records, a backup is made before anything changes. It goes into `<backupsDir>/<time>-before-<first pending migration>/`: `database.dump`, from `pg_dump --format=custom`, and `data.tar.gz`, from `dataDir` when it exists. The newest five backups are kept. If the backup fails, nothing is migrated.
- A database that has a migration this release doesn't know was migrated by a newer release. `createFxbot` refuses it, and says to update or restore the backup taken before that update.

## Errors

A call that fails on purpose throws an `Error` with a `status`, so a server can answer with the same status.

| `status` | When |
| --- | --- |
| 400 | Bad input, or a request fxbot refuses, such as a message to a bot with no provider |
| 404 | A missing bot, or a missing provider, memory, library item, add-on, or sign-in |
| 409 | An add-on changed since its preview, or a skill is already added |
| 502 | A service fxbot asked failed: a device code sign-in, a model list, a registry, an MCP server, or the summary for a provider switch |

An `Error` without a `status` is unexpected. fxbot's server answers it with 500.

## Stopping

`close()` stops the timers, closes the MCP connections, and closes each provider's agent, which waits for the turns this process started. It waits for their replies to be saved, then ends the Postgres connection.

Before 0.4.0, `close()` didn't wait for the save of a reply that just finished, so a script that called it right after a turn could crash with `CONNECTION_ENDED`.
