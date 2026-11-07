# Package guide

Applies to everything under `packages/`. Follow the repository's [AGENTS.md](../AGENTS.md) and [CONVENTIONS.md](../CONVENTIONS.md).

## What lives where

Three npm workspaces. The SDK has two public entry points: `@fxbot/sdk` for backends and `@fxbot/sdk/client` for HTTP consumers. They are exports of one package.

```text
packages/
├── sdk/                         @fxbot/sdk — bot behavior and persistence
│   └── src/
│       ├── index.ts             createFxbot: input checks, profiles, settings,
│       │                        prompts, session resume, uploads, SDK streams,
│       │                        provider switches
│       ├── store.ts             the Postgres schema; profiles, settings,
│       │                        providers, attachment records
│       ├── library.ts           every bot's files, one copy each: saves and tags,
│       │                        search and listing, file reads, the library tools
│       ├── providers.ts         one libfx agent per provider, key checks,
│       │                        device code sign-ins, the refresh lock
│       ├── models.ts            each provider's models and what fxbot knows of them
│       ├── secrets.ts           sealing keys and tokens; the secrets table
│       ├── vercel.ts            Vercel account sign-in and its request fetch
│       ├── history.ts           messages, the chat_history tool, switch summaries
│       ├── types.ts             shared data contracts and the kinds table;
│       │                        no runtime imports
│       └── client.ts            @fxbot/sdk/client: fetch calls, stream parsing,
│                                reconnect cursors, applyLine turn reducer
├── server/                      @fxbot/server — HTTP adapter and process startup
│   └── src/
│       ├── index.ts             environment, routes, body limits, status codes,
│       │                        stream piping, static UI files, shutdown
│       └── rotate-key.ts        npm run rotate-key
└── ui/                          @fxbot/ui — Vite/React/shadcn PWA
    ├── vite.config.ts           the dev API process and proxy, PWA manifest and
    │                            offline shell
    ├── public/                  app icons
    └── src/
        ├── main.tsx             React entry point
        ├── app.tsx              routes, sidebar, forms, chat and composer
        ├── nav.ts               in-app navigation for links
        ├── library.tsx          the Library page and the item preview
        ├── bot-panel.tsx        the panel beside a chat: Details and Library tabs
        ├── providers.tsx        Settings' providers, sign-in dialog, key form
        ├── blob.tsx             a bot's look on the page, and its motion
        ├── blob-draw.ts         a look as SVG: eyes, what's worn. The site has a copy
        ├── blob-data.ts         shapes and color tones, from scripts/blob-data.mjs
        ├── look-picker.tsx      the look's tabs, and Surprise me
        ├── client.ts            the page's HTTP client instance
        ├── use-turn-stream.ts   React state and subscription lifecycle
        ├── attachments.ts       browser file reading, previews, image resizing
        ├── index.css            Tailwind and theme
        └── components/ui/,      shadcn components and their helpers
            lib/, hooks/
```

## Choose the owner

| If the change concerns… | Put it in… | Why |
| --- | --- | --- |
| Bot rules, accepted inputs, model selection, prompts, session recovery | `sdk/src/index.ts` | The same behavior must work without HTTP. |
| Saving profiles, settings, providers or attachment records | `sdk/src/store.ts` | The SDK owns application storage in Postgres; libfx owns durable session storage. |
| Files bots keep: uploads, saved documents, search, the library tools | `sdk/src/library.ts` | One copy of each file by its SHA-256, tagged with every bot and chat that saved it. |
| Providers, their agents, key checks, sign-ins, or model lists | `sdk/src/providers.ts`, `models.ts`, `vercel.ts` | One libfx agent per provider; libfx's sign-in for plans, fxbot's own for Vercel. |
| Keys and tokens | `sdk/src/secrets.ts` | Sealed before Postgres sees them. Never returned by any call. |
| Messages, chat_history, or the summary on a provider switch | `sdk/src/history.ts` | A bot's searchable record of its chats. |
| A data shape shared by backend and client | `sdk/src/types.ts` | Both SDK entry points re-export these types. Keep this file free of runtime dependencies. |
| HTTP client methods, NDJSON parsing, reconnects, or folding stream lines into turns | `sdk/src/client.ts` | Any UI or script calling the server needs this behavior; it has no React dependency. |
| URLs, HTTP methods, JSON decoding, request size limits, headers, status codes or serving the build | `server/src/index.ts` | These are transport and process concerns. Delegate bot operations to the SDK. |
| Screens, interactions, rendering, React state or preparing browser files | `ui/src/` | These depend on the browser and presentation. UI checks provide feedback; the SDK still validates submitted data. |
| Installability, shell caching, the development proxy, or how `npm run dev` runs the API | `ui/vite.config.ts` | These belong to the page's build and delivery. Keep `/api` on the network. |

Use `@fxbot/sdk` when backend code needs to run fxbot directly in its process. Use `@fxbot/sdk/client` when a page or script talks to an already running fxbot server. See the [SDK examples](sdk/README.md).

## How the pieces connect

```text
Browser:  @fxbot/ui → @fxbot/sdk/client
                            │
                     HTTP /api (JSON + NDJSON)
                            ↓
Node:                 @fxbot/server → @fxbot/sdk → libfx → model API
                                          │
                                Postgres + libfx session files
```

`client.send()` posts a message; it resolves when the prompt is accepted, not when the reply finishes. A separate `client.stream()` reads the reply and replayed history. The client parses lines and `applyLine()` builds turns; `useTurnStream()` holds those turns in React state.

- The UI imports only `@fxbot/sdk/client`, including for types. Never import the SDK runtime, its internal source files, Node storage or libfx into the UI.
- Keys and tokens stay on the server, sealed in Postgres by the SDK. The server passes the sealing key to `createFxbot()`. The page sends a key once; neither the browser nor the client entry point ever receives one.
- Keep bot behavior out of route handlers and React hooks. Keep HTTP wiring out of the SDK runtime, and React state out of the SDK client.
- For an API change, update the SDK behavior and shared types, the server route, the client method and the consuming UI as needed. A layout change normally stays in `ui/`.
- Keep the three-package layout. A new package needs a second real consumer; do not add a layer for a hypothetical future use.

## Working on a package

Run commands from the repository root with Node 22.18 or newer, after `npm install`:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Typecheck all three workspaces using their own configs. |
| `npm run build` | Build the UI and service worker into `packages/ui/dist/`; does not typecheck. |
| `npm run server` | Run the API and serve the built UI on port 8787. Requires Postgres, `FXBOT_DATABASE_URL`, and `FXBOT_SECRET_KEY_FILE` (see the README); use a disposable database, `FXBOT_DATA`, and `FXBOT_PORT` for manual checks. |
| `npm run rotate-key -- <file>` | Seal every stored secret under a new key, with the server stopped. |
| `npm run dev` | Run Vite on port 5173 and the API beside it on 8787 (or `FXBOT_PORT`), proxying `/api`. A change to the UI reloads the page; a change to the SDK reloads the page and restarts the API; a change to the server restarts the API. Stop any separate `npm run server` first. |

The SDK and server run TypeScript source directly; only the UI has a build step. There is no automated test suite or CI. Check affected behavior manually and run `git diff --check`; inspect new files separately. Add shadcn components from `packages/ui` with `npx shadcn@latest add <name>`.
