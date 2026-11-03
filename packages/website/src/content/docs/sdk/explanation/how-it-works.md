---
title: "How the SDK works"
description: "@fxbot/sdk runs bots for your app: their chats, their providers, their tools, and their records. This page is about what happens under the calls, and why the SDK is shaped the way it is. fxbot's own architecture is the same story, told for the app."
---

`@fxbot/sdk` runs bots for your app: their chats, their providers, their tools, and their records. This page is about what happens under the calls, and why the SDK is shaped the way it is. fxbot's own [architecture](/docs/explanation/architecture/) is the same story, told for the app.

## Two entries

The SDK has two entries, for two places.

`@fxbot/sdk` runs in your backend, on Node. `createFxbot()` connects to Postgres, brings the database up to date, starts one agent per provider, and runs any turn that a stopped process left open. It holds the key that seals secrets, and every call that touches a key, a token, or a model goes through it.

`@fxbot/sdk/client` runs in a page or a script. It talks to a server over HTTP, and has the two pieces a chat needs: a stream reader that reconnects, and `applyLine`, which folds stream lines into turns. It imports nothing from the server side, only the shared types, so a page that bundles it gets no server code and no key.

The split is the line between what holds secrets and what shows them. A page can do everything fxbot's page does, and a key it sends up never comes back to it.

## One agent per provider, one chat per bot

A turn runs on [libfx](https://fx.sh/docs/lib), the agent from fx. libfx gives an agent one provider, and a session runs only on the agent that started it. So the SDK starts one libfx agent per provider, and the bots on that provider share it.

Each bot has one durable session, its chat. libfx keeps the session in Postgres, step by step, so a turn survives a restart, through [Workflow's Postgres World](https://workflow-sdk.dev/worlds), in schemas of its own. The SDK keeps everything else in Postgres too: the bots, providers, settings, plugins, the library, memories, and a plain-text copy of every message, which `chat_history` and memory search read.

libfx keeps no model or instructions with a session. So each time the SDK opens a bot's chat, it passes them: the bot's model, its instructions, the summary from a provider switch, its newest memories, and the list of its skills, within libfx's 64 KiB. It also passes the bot's id, which every tool reads to know whose chat it runs in.

Moving a bot to another provider can't move its session, so the bot starts a new one there, from a summary of the old. See [Moving a bot to another provider](/docs/explanation/bots-and-chats/#moving-a-bot-to-another-provider).

## A turn, end to end

1. `send(id, { text, messageId })` checks the message. On a bot's first message, it saves a new session id to the bot first, so a restart finds the chat. Files go into the library, and a skill named with `$name` goes along with the text.
2. libfx stores the prompt. The SDK records the message in Postgres, and `send` resolves. The same `messageId` again reaches the same turn and runs nothing new.
3. libfx runs the turn: it asks the model, calls tools as the model asks, and writes each step to the session's files.
4. `stream(id, cursor)` reads the session's lines from the cursor on, as libfx writes them, and stays open for more. libfx's `turn_start` line carries a message only when it was plain text, so the SDK puts back the text and files of a message that sent more.
5. When the turn ends, the SDK records the reply's text in Postgres, and the start of it as the bot's `preview`.
6. Each message recorded nudges the embeddings loop, which gives it a vector in the background.

Nothing in the turn waits for the page. A reader that leaves and comes back picks up from its cursor, and a turn left open by a stopped process runs again when `createFxbot` starts, with a `turn_resume` line.

## The tools every bot gets

Every agent gets the same tools: `chat_history`, the three memory tools, the three library tools, the `skill` tool once there are skills, and the allowed tools of each MCP server, named after it. libfx fixes an agent's tools when it is made. So a change to them, such as a new MCP server, makes every agent again, one change at a time, after its running turns finish.

Since one agent serves every bot on its provider, a tool can't know its bot from the agent. It reads the bot's id from the session, never from what the model asks. A memory tool reaches only that bot's memories, the library tools only its items, and an MCP tool refuses to run in a bot it wasn't given to.

## Migrations at start

The schema is a set of numbered SQL files in the SDK, each run once, in order. `createFxbot` runs the ones the database hasn't seen, in one transaction, under a lock, so two processes starting at once take turns, and a failure keeps none of them.

When the database already holds records, it first backs them up: the database with `pg_dump`, and `dataDir` as a tarball, into a folder of `backupsDir`. It keeps the newest five. A database that a newer release has migrated is refused, since its schema may not suit this one.

This is why updating the SDK is a pull and a restart. The app needs no migration step of its own.

## Sealed secrets

API keys, sign-in tokens, and an MCP server's header values and OAuth tokens are sealed in the SDK before they reach Postgres. Postgres holds only the ciphertext. The key that seals them is the `secretKey` your app passes to `createFxbot`, so it stays in your backend, and the database never holds it. `rotateSecrets` seals everything again under a new key.

Opened secrets stay in the process's memory, for the requests that need them. The SDK's answers don't carry them: a listed provider says only whether it holds a key or a sign-in. Device code and OAuth sign-ins run in the backend too, and hand out only a link, a code, and an id to check on. The security model behind this is in [Security model](/docs/explanation/security/).

## Memories and the embeddings loop

Each bot keeps memories in Postgres. The newest go into its instructions on every turn, and `memory_search` finds the rest. Search matches words, with Postgres's full-text search, and meaning, with vectors in pgvector, and fuses the two lists.

The vectors come from one loop in the SDK. A saved memory, a recorded message, or a new setting nudges it, and it fills in what's missing: memories first, then messages, newest first, 32 to a request. They come from the local embedder at `embedUrl`, from a provider's embedding model, or from nowhere, as the settings say. Each model has vectors of its own, and search compares only the current model's, so a new model never mixes sizes.

The loop never holds up a turn. When the embedder is down, the loop tries again a minute later, and a search that gets no vector within 5 seconds uses words alone. How search ranks: [Search by words and by meaning](/docs/explanation/bots-and-chats/#search-by-words-and-by-meaning).

## TypeScript source in a workspace

The SDK is TypeScript, run as it is. Its package points at `.ts` files, and Node 22.18 and newer strips the types as it loads them, so there is no build step. fxbot's server runs the same way.

Node won't strip types in a file under `node_modules`. So an app takes the SDK as an npm workspace: `node_modules/@fxbot/sdk` is a link to fxbot's `packages/sdk`, and Node loads the files from there. Putting the SDK on npm would need a build step, so for now an app takes it from fxbot's repository, at a release.

## fxbot is one app on it

fxbot's own server and page are built on the SDK, as yours would be.

- `packages/server` adds HTTP and nothing more: routes over the SDK's calls, body limits, the check that a write comes from the page's own origin, and the page's files. In a release install, it also asks the machine for updates. A bad input throws an `Error` with a `status`, such as 400 or 404, and the server answers with it.
- `packages/ui`, the page, imports only `@fxbot/sdk/client`.

So whatever fxbot's page does, a page of yours can do through the same client, against the same server. And whatever fxbot's server does, a backend of yours can do through the same SDK.
