# Architecture

fxbot is one Node server around [libfx](https://fx.sh/docs/lib), Postgres, and a web page. This page is about how those parts fit, and why there are so few of them.

## One process

A release runs one Node process. It serves the built page and its API on 127.0.0.1, runs every bot's agent, and holds every key. There is no second service, no queue, and no process manager beyond systemd. Records live in Postgres, and libfx keeps each chat's session in files.

## The packages

The repository is a TypeScript monorepo, laid out after [eve](https://eve.dev): a core package with a client subpath, a thin server, and a UI on the client. The packages run as TypeScript source on Node 22.18 or newer. Only the app and this site have a build step.

| Package | What it holds |
| --- | --- |
| `@fxbot/sdk` | The agent system: providers and their sign-ins, one libfx agent per provider, bots, settings, the library, MCP servers, each bot's durable chat, and its searchable history. It keeps the records in Postgres, seals the secrets, and runs the migrations. |
| `@fxbot/sdk/client` | A typed client for the server's API, with the stream reader and the turn reducer a UI needs. It carries no credentials. |
| `@fxbot/server` | HTTP and nothing more: `node:http` routes over the SDK, body limits, and status codes. It reads the settings, serves the page, and runs updates. |
| `@fxbot/ui` | The app: Vite, React, and shadcn/ui, built on `@fxbot/sdk/client` alone. |
| `@fxbot/website` | This site, built to static pages. |

Everything about bots lives in the SDK, so another server or UI could be built on it. The UI imports only the client entry, so no server code or secret can reach the browser. More is in the SDK's [README](packages/sdk/README.md).

## A message, end to end

1. The page sends a message with an id it made, to `/api/profiles/<bot>/messages`.
2. The SDK hands it to the libfx agent of the bot's provider, and answers once libfx has stored the prompt. The same id sent again runs nothing new.
3. The page reads the chat as a stream of lines, from the start and then as they come. After a dropped connection it picks up where it left off.
4. libfx runs the turn, calling tools as the model asks, and writes each step to the session's files.

Because the turn lives on the server, a reload, a closed app, or a lost connection doesn't stop it. A turn that a stopped server left open runs again when the server starts.

## Why one agent per provider

A libfx session belongs to the agent that started it, and an agent's tools are fixed when it is made. So fxbot keeps one agent per provider, shared by the bots on it, and decides inside each tool which bots may use it. Moving a bot to another provider starts a new session, which [carries a summary](/docs/explanation/bots-and-chats/#moving-a-bot-to-another-provider) of the old one.

## Kept small on purpose

No web framework, no Next.js, no Vercel AI SDK, and no second agent runtime. A new abstraction waits for its second real use. The repository's [CONVENTIONS.md](CONVENTIONS.md) has the rules.
