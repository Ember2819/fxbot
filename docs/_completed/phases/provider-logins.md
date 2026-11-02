# Provider logins

Connect model providers from Settings, then run each bot on one of them.
- **Plans and accounts sign in with a device code:** ChatGPT, Grok, and a Vercel account.
- **API providers take a key:** OpenAI, AI Gateway, OpenCode Zen and Go, OpenRouter.
- **Local and custom servers take a base URL:** Ollama, LM Studio, or any Chat Completions server.

The SDK fetches each provider's models and works out what each model can do.

Agents may run on this machine, so every fxbot record moves into Postgres. Keys and tokens are sealed in the SDK, so Postgres holds only ciphertext.

When a bot switches provider, its chat is compacted into a handoff summary. The new session starts from that summary, and the bot can search the earlier messages with a `chat_history` tool.

Before this phase, the server took one endpoint from `FXBOT_BASE_URL` and `FXBOT_API_KEY`, and kept everything in files.

Removed after this phase: those two variables, the `env` provider they made, and the import of v1's files, which moved v1's bots and chats onto that provider. Providers are added only in Settings. The sections below still describe them as built.

Status: built on 2026-11-01, and checked against mock model servers and stubbed sign-in services: 195 checks, all passing (section 4). Real accounts are still to be tried by hand. Where the build differs from the plan, section 3 says so under **Built**.

## 1. Research

These are read from source and docs, as of November 2026. Each path is relative to its repository.

**fx CLI** ([docs](https://fx.sh/docs/getting-started/authentication), `vercel-labs/fx`)
- `fx login codex` and `fx login grok` open a browser with a localhost callback. The Codex callback uses port 1455 (`src/core/auth/chatgpt_oauth.zig`). For Grok, the CLI can also take a pasted code (`grok_oauth.zig`). There is no device code and no headless detection.
- `fx login vercel` uses an RFC 8628 device code with fx's own client, then picks a team from `api.vercel.com/v2/teams` (`login_flow.zig`).
- Sign-ins are saved to `~/.fx/chatgpt-auth.json` and `grok-auth.json`, mode 0600, each with a `.lock` file. A gateway key goes to `api-key` on Linux, or the Keychain on macOS.
- The Codex model list is `GET chatgpt.com/backend-api/codex/models?client_version=<@openai/codex version from npm>` (`src/gateway/openai_codex_models.zig`). fx keeps `visibility == "list"` and `supported_in_api`, uses `slug` as the id, and reads `context_window` and `input_modalities`.
- The Grok model list is `GET cli-chat-proxy.grok.com/v1/models` (`xai_grok_models.zig`). fx keeps `api_backend == "responses"`.
- The Gateway catalog is `ai-gateway.vercel.sh/coding-agent/v1/models`. With a Vercel login, fx adds `?teamId=`.
- Custom connections never call `/models`. Their metadata is whatever the user configures.
- Compaction ([docs](https://fx.sh/docs/using-fx/context-compaction)):
  - It runs at 80% of the usable window.
  - The handoff is "a separate, tool-free request to the current session model". It keeps the user's prompts in order, summarizes the work around them, and is capped at 10% of the window.
  - "Later compactions carry the previous handoff forward", and the original conversation is kept.

**libfx 0.0.16** ([providers](https://fx.sh/docs/lib/providers), the installed package)
- **Providers.** An agent runs on one provider: AI Gateway (`apiKey`), `"codex"`, `"grok"`, or a custom Chat Completions `{ name, baseUrl, models }`. "The provider applies to the whole agent and every session it runs."
- **Sessions.** A session runs only on the agent named in its first input. `durable.js` forwards other messages to that agent.
- **Sign-in.** `libfx/chatgpt` and `libfx/grok` ship device code sign-in (`startDeviceSignIn`, `completeDeviceSignIn`, `refreshCredentials`), and take a `fetch` option.
- **Credentials.**
  - The host supplies them through `credentials()`. libfx refreshes them near expiry or after a 401, and hands the new ones to `onCredentials()`. `refreshLock` serializes refreshes.
  - libfx keeps the credentials it adds itself out of sessions and events, and masks them in errors.
- **Requests.** An agent's `fetch` option "replaces the global fetch for model and catalog requests".
- **Model lists and metadata.**
  - `listModels({ apiKey })` covers AI Gateway only. There is no public model list for Codex or Grok.
  - A custom provider's `models` metadata comes from the host: "libfx can't query these from the server".
- **Base URL rule.** A custom base URL must be HTTPS, or HTTP on loopback. libfx checks that only when a turn opens its engine; in a probe, `createFxAgent` accepted `http://10.0.0.5:11434/v1`.
- **Compaction.** libfx has no public compaction API. Compaction appears only as a model-call purpose in hooks.
- **Engines and tools.**
  - `session.checkpoint()` returns a session's history "as opaque bytes, read without changing the session".
  - `createFxEngine({ checkpoint })` restores history into an in-memory engine.
  - Host tools are `{ name, description, inputSchema, execute(input, context), idempotent }`, and a session's `context` reaches every tool call.

**eve** ([dev TUI](https://eve.dev/docs/guides/dev-tui), [security model](https://eve.dev/docs/concepts/security-model), `vercel/eve`)
- **Login.** `/login` lists Vercel account (device code), AI Gateway key, ChatGPT plan, OpenAI key, and Anthropic key (`setup/flows/model-login-options.ts`).
  - ChatGPT signs in by device code when `SSH_CONNECTION` or `SSH_TTY` is set (`setup/flows/chatgpt-auth.ts:96`).
  - The Codex list is called with `client_version=0.162.0`, hardcoded.
  - `/login` works locally only: "/login doesn't link a deployment or authenticate a remote server".
- **Stored credentials.** For a server, eve's docs name "a cloud secret manager, an encrypted database table, a token broker". Its own Postgres world stores workflow data "without encryption".
- **Boundary.** Secrets stay in the app runtime, and the sandbox gets no `process.env` and "no path back into the app runtime".

**opencode** (`anomalyco/opencode` v2.2.5; `sst/opencode` redirects there)
- **Logins.** Each provider is an integration with login methods (`key`, `env`, `oauth`, `external`, `command`; `packages/schema/src/integration.ts`).
  - Logins run on the server as attempts with start, status, complete, and cancel routes, which expire after 10 minutes (`packages/protocol/src/groups/integration.ts`).
  - ChatGPT has a device code method on libfx's `deviceauth` endpoints (`packages/core/src/plugin/provider/openai.ts:184`).
  - Its OpenCode console login uses opencode's own client `opencode-cli` and carries organization policies (`opencode.ts`). OpenCode Go takes a key.
- **Credentials** sit in SQLite with mode 0600, and are refreshed 5 minutes before expiry under a lock.
- **A mistake not to copy:** `GET /api/credential` returns every stored secret.
- **Model metadata** comes from a models.dev mirror, refreshed with an ETag.
- **Local servers are probed:**
  - Ollama: `/api/tags`, then `/api/show`, reading `capabilities` and `*.context_length` (`ollama.ts:68`).
  - LM Studio: `/api/v1/models` (`lmstudio.ts:31`).

**Other references**
- **openbot** (`CopilotKit/openbot`; OpenDuet vendors it):
  - Its Grok device code checks the verification URL is HTTPS on an `x.ai` host before showing it (`desktop/src-tauri/src/provider_oauth.rs`).
  - "React does not receive access or refresh tokens."
- **fx0** (`vercel-labs/fx0`):
  - It signs in with Vercel, and sends the user's token to AI Gateway through libfx's `fetch` option, with a placeholder `apiKey`. Each request gets `authorization: Bearer` and `x-vercel-ai-gateway-team` (`lib/libfx-agent.ts:217`, `lib/gateway-session.ts`).
  - Tokens go in an encrypted httpOnly cookie, and each turn's credential is encrypted before it is stored in Redis.
- **durable-harness**: a proxy adds the credential to each request, so "a child process never holds the secret".
- **OpenDots**: the setup status sent to the page is only booleans.
- **agent-browser**: one mistake to avoid. A failed model list comes back as an empty list with HTTP 200.
- **openmuse**, **agent-desktop**, and the [Grok Bot docs](https://docs.x.ai/grok-bot/overview): nothing to copy.

**Checked here**
- **Vercel** (`vercel.com/.well-known/openid-configuration`): `device_authorization_endpoint` is `https://api.vercel.com/login/oauth/device-authorization`, the token endpoint is `https://api.vercel.com/login/oauth/token`, and the device code grant is listed, with token auth method `none`.
- **models.dev:**
  - `opencode` (Zen) is at `https://opencode.ai/inference/openai/v1` and `opencode-go` is at `https://opencode.ai/inference/go/openai/v1`. Go's `/openai/v1/models` returns 404.
  - Its per-model fields map onto libfx's custom-provider metadata.
- **OpenCode** ([Go docs](https://opencode.ai/v2/docs/console/go/), and requests with a fake key):
  - Go refuses a chat request without a per-conversation `x-opencode-session` header: `400 MissingSessionID`. Zen does not require it.
  - OpenCode asks clients to name themselves in the user agent.
  - The key-checked model lists are `https://opencode.ai/inference/v1/models` (Zen) and `https://opencode.ai/inference/go/v1/models` (Go). They answer a fake key with 401; the lists under `/openai/v1` return 404 for any key.
- **Debian 13** ships Postgres 17 and `postgresql-17-pgvector` 0.8.0.
- **The `postgres` npm client** (Postgres.js) has no dependencies and connects over a unix socket. The build pins 3.4.9 (see **Built**).

## 2. Key takeaways

1. **Use device code for every sign-in.** In fxbot the browser is often a phone over Tailscale, and a localhost redirect lands on the wrong machine.
   - libfx ships device code for ChatGPT and Grok, and Vercel's OIDC lists it.
   - ChatGPT accounts and workspaces must allow device code sign-in.
2. **Run each login on the server as an attempt the page polls,** in opencode's start, status, and cancel shape. The page gets only the URL, the code, and the expiry.
3. **Make keys write-only.** No route returns a secret, unlike opencode's `/api/credential`.
4. **Put every fxbot record in Postgres, and seal the secrets.**
   - Agents may run here. A plain 0600 file, as fx and opencode keep, is readable by any agent running as the same user.
   - The SDK seals with AES-256-GCM. The key sits in a file outside the repo, readable only by the server's OS user, and Postgres is reached over a socket with peer auth.
   - Postgres was coming for memories anyway.
5. **Let the SDK find the models,** with one source per kind (section 3), and cache each list for 5 minutes. A failed list reports its reason, never an empty list. (Since 0.2.0 each list is also kept in Postgres, answered at once after a restart, and refreshed behind the answer: [issue 5](https://github.com/iammrduncan/fxbot/issues/5).)
6. **Run one libfx agent per provider.** A session cannot change agents.
7. **Compact on a provider switch,** as fx does: one tool-free summary request, carried forward each time. The messages stay searchable through `chat_history`. libfx has no compaction API, so fxbot does this itself.
8. **Add credentials to requests in one place.**
   - Plans: libfx's `credentials()`.
   - Vercel: the agent's `fetch`, as fx0 does. That code masks the token itself, because libfx masks only the credentials it adds.
   - One lock serializes every refresh.

## 3. Implementation

### Provider kinds

One `kind` picks the sign-in, the libfx provider, and the model source. The table lives in the SDK as plain data, and `@fxbot/sdk/client` exports it for the UI's Add list.

| Kind | Connects with | libfx provider | Models and metadata |
| --- | --- | --- | --- |
| `chatgpt` | Device code (`libfx/chatgpt`) | `"codex"` | Codex list: `slug`, `context_window`, `input_modalities`, where `visibility == "list"` and `supported_in_api` |
| `grok` | Device code (`libfx/grok`) | `"grok"` | Grok list: `model`, `context_window`, `max_completion_tokens`, where `api_backend == "responses"` |
| `vercel` | Device code (fxbot's Vercel OAuth app), then a team | AI Gateway; the agent's `fetch` adds the token and team | libfx `listModels` through the account's `fetch` |
| `gateway` | Key | AI Gateway, `apiKey` | libfx `listModels({ apiKey })` |
| `openai` | Key | Custom, `https://api.openai.com/v1` | models.dev `openai` |
| `opencode` | Key (Zen) | Custom, `https://opencode.ai/inference/openai/v1` | models.dev `opencode`, Chat Completions models only |
| `opencode-go` | Key | Custom, `https://opencode.ai/inference/go/openai/v1` | models.dev `opencode-go`, Chat Completions models only |
| `openrouter` | Key | Custom, `https://openrouter.ai/api/v1` | models.dev `openrouter` |
| `ollama` | Base URL (default `http://localhost:11434/v1`), context field | Custom | `/api/tags`, then `/api/show` per model: `capabilities`, `*.context_length` |
| `lmstudio` | Base URL (default `http://localhost:1234/v1`), context field | Custom | `/api/v1/models`: `vision`, `trained_for_tool_use`, the loaded context length |
| `custom` | Base URL, optional key, context field | Custom | `GET {baseUrl}/models`: ids only |

- **Plan model calls** send the headers libfx sends on the engine's own calls: `authorization`, plus `chatgpt-account-id` or `x-userid`.
- **The Codex `client_version`** is the `version` in `https://registry.npmjs.org/@openai/codex/latest`, read once a day. No `originator` header is sent.
- **"Chat Completions models only"** drops the models that models.dev marks as served over Anthropic's or Google's API.
- **The context field** (`contextWindow`) is optional, on `ollama`, `lmstudio`, and `custom` providers. It overrides the probe for every model of that provider, because Ollama serves `OLLAMA_CONTEXT_LENGTH`, not a model's trained context.
- **`FXBOT_BASE_URL` and `FXBOT_API_KEY`** stay supported as the read-only `custom` provider `env`. Its key stays in the environment in plain text, so the agent-safe setup adds that key in Settings instead.

### Models (`packages/sdk/src/models.ts`)

- `models(provider)` returns `Model[]`, where `Model` is `{ id, name?, contextWindow?, maxOutputTokens?, supportsToolUse?, supportsVision? }`. A field a source does not give stays unset. Each list is cached for 5 minutes. A failure throws with the source's status and reason.
- **models.dev** (`https://models.dev/api.json`, about 600 KB gzipped):
  - It is fetched at most once a day with `If-None-Match`, trimmed to the hosted kinds, and kept in Postgres.
  - It maps `limit.context`, `limit.output`, `tool_call`, and `modalities.input` containing `"image"`.
- **Before a turn on a custom kind,** the SDK sets `provider.models[id]` from the list, with the provider's context field taking precedence. A known `contextWindow` lets libfx compact long chats ([context management](../../phases/context-management.md)). Vision stays `true` when unknown.

### Sign-in

- **ChatGPT and Grok:**
  1. `POST /api/sign-ins` with `{ kind, provider? }`. The SDK calls `startDeviceSignIn({ fetch })` and keeps the object in memory, because its `deviceAuthId` or `deviceCode` can claim the tokens.
  2. The SDK runs `completeDeviceSignIn` in the background with an abort signal. The page gets only `{ id, verificationUrl, userCode, expiresAt }`.
  3. The page polls `GET /api/sign-ins/:id` every 3 seconds. The status is `waiting`, `done` with the provider id, or `failed` with libfx's message, which for ChatGPT says how to turn device code on.
  4. `DELETE` cancels. A new start cancels the old one. A restart drops pending attempts.
  5. With `provider` set, the attempt replaces that provider's credentials, which is the fix after a failed refresh.
- **Vercel account (`packages/sdk/src/vercel.ts`):** the same attempt routes, over RFC 8628:
  - Start: `POST https://api.vercel.com/login/oauth/device-authorization` with `client_id` from `FXBOT_VERCEL_CLIENT_ID` and `scope=openid offline_access`.
  - Poll: `POST https://api.vercel.com/login/oauth/token` with the device code grant. It handles `authorization_pending`, `slow_down` (5 more seconds), `expired_token`, and `access_denied`.
  - `verification_uri_complete` is shown only if it is HTTPS on `vercel.com`, openbot's check.
  - Teams: after sign-in, the SDK reads `GET https://api.vercel.com/v2/teams`. One team is picked automatically; with several, the page shows a team select.
  - Requests:
    - The agent gets a placeholder `apiKey` and a `fetch` that sets `authorization: Bearer <access>` and `x-vercel-ai-gateway-team: <team>` (fx0).
    - It refreshes the token with `grant_type=refresh_token` near expiry, under the shared lock.
    - It masks the access and refresh tokens in any error body.

### Keys and checks

- A key goes to the server once, in a password field, and is never sent back. Listings say only `hasKey` or `signedIn`. To replace a key, `PATCH` a new one.
- On add, the SDK checks the base URL against libfx's rule. It then checks the key with `GET {baseUrl}/models`, or with `listModels` for `gateway`:
  - A 401 or 403 refuses the provider with "The provider rejected this key".
  - OpenCode keys are checked at OpenCode's own lists, which reject a bad key.
  - Elsewhere, a 404 is accepted, since some servers serve no list at `/models`.
  - Any other failure refuses it with the status.
  - The key is masked in every message.
- Local kinds are checked by their own probe.

### Postgres

Every record fxbot owns lives in Postgres. libfx's sessions stay in `data/sessions`. The SDK creates the tables at start with `create table if not exists`, so there is no migration tool yet. Access goes through `postgres` (Postgres.js).

```sql
settings  (id int primary key default 1 check (id = 1), default_provider text)
providers (id text primary key, kind text not null, name text not null, base_url text,
           model text not null default '', context_window int, team_id text, created_at timestamptz default now())
secrets   (provider_id text primary key references providers on delete cascade,
           sealed bytea not null, updated_at timestamptz default now())  -- nonce ‖ GCM tag ‖ ciphertext
profiles  (id text primary key, name text not null, instructions text not null default '',
           provider text references providers, model text not null default '',
           session_id text, handoff text, preview text, created_at timestamptz default now())
sent      (profile_id text references profiles on delete cascade, message_id text,
           input text not null, files jsonb not null, primary key (profile_id, message_id))  -- today's Sent records
images    (profile_id text references profiles on delete cascade, name text,
           type text not null, data bytea not null, primary key (profile_id, name))      -- name: sha256.ext
messages  (id bigserial primary key, profile_id text references profiles on delete cascade,
           session_id text not null, message_id text not null, role text not null, text text not null,
           created_at timestamptz default now(),
           tsv tsvector generated always as (to_tsvector('simple', text)) stored)
models_dev (id int primary key default 1 check (id = 1), etag text, data jsonb, fetched_at timestamptz)
```

- **Indexes.** `messages` has a GIN index on `tsv` and an index on `(profile_id, created_at)`.
- **Consistency.** A provider and its secret are written in one transaction, so no write-order rules are needed.
- **The store.** `store.ts` moves to Postgres, so the SDK's calls become async and the server awaits them. Each change is one statement or one transaction. That replaces v1's "sync calls on purpose" rule.
- **Import from files.** While v1's files are in the data directory, the SDK imports `data/profiles/`, `settings.json`, and `uploads/` at start. Every insert skips what is already stored. It replays each session's stream through `applyLine` to fill `messages`. Then it moves the old files to `data/imported/`.
- **`FXBOT_DATABASE_URL` is required.** The server refuses to start without it.

### Sealed secrets (`packages/sdk/src/secrets.ts`)

- **Sealing.**
  - `seal` and `unseal` use AES-256-GCM from `node:crypto`, with a fresh 12-byte nonce on every write.
  - The provider id is bound in as AAD, so a row copied onto another provider fails to open.
  - Postgres never sees the key. No `pgcrypto`: its key would travel inside SQL, where Postgres's logs can capture it.
- **Reads and writes.** Opened secrets stay in the server's memory. Refreshed tokens are sealed again and upserted.
- **A row that fails to open** marks only its provider: "Cannot open this provider's secret. Sign in again, or check FXBOT_SECRET_KEY_FILE." The server keeps running.
- **Rotation.**
  1. Stop the server.
  2. Run `npm run rotate-key -- <new key file>`. It reads the old key from `FXBOT_SECRET_KEY_FILE`, and `rotateSecrets({ databaseUrl, from, to })` in the SDK seals every row again in one transaction.
  3. Point `FXBOT_SECRET_KEY_FILE` at the new file, and start the server.
- **Losing the key** loses every stored secret, so keep a copy apart from database backups.

### Setup

| Variable | Holds |
| --- | --- |
| `FXBOT_DATABASE_URL` | Postgres for fxbot's own role, with no password: peer auth over the local socket, as `postgres:///fxbot` with `PGHOST=/var/run/postgresql` |
| `FXBOT_SECRET_KEY_FILE` | The path to a file outside the repo, holding 32 random bytes in base64 |
| `FXBOT_VERCEL_CLIENT_ID` | The id of fxbot's Vercel OAuth app, which the owner registers; needed only for `vercel` |

None of the three holds a secret, so `.env` can name them all.

One-time setup on Debian:

```sh
sudo apt install postgresql
sudo useradd --system --create-home fxbot          # the server's own OS user
sudo -u postgres createuser fxbot
sudo -u postgres createdb -O fxbot fxbot           # peer auth: only OS user fxbot can connect as role fxbot
sudo install -d -o fxbot -m 700 /etc/fxbot
openssl rand -base64 32 | sudo -u fxbot tee /etc/fxbot/secret.key >/dev/null
sudo chmod 400 /etc/fxbot/secret.key
```

The server runs as `fxbot` and owns `data/` with mode 700. Agents run as another non-root user.

### Agents, bots, and provider switches

- **Agents.** One libfx agent per provider, named `p-<id>`. `env` keeps the name `fxbot`, so today's chats continue.
  - All the agents share `data/sessions`. Each starts at boot, so open turns resume, and when its provider is added.
  - Editing a base URL makes the agent again under the same name; libfx says sessions follow the new URL. Removing a provider closes its agent, and is refused while a bot uses it.
- **Bots.** A new bot takes `settings.default_provider`. An empty `model` means the provider's default. Changing a model keeps the chat.
- **Every message is recorded in `messages`:** the user's text at send, and the reply when the turn ends, where the preview is already read.
- **Switching a bot's provider** compacts the chat:
  1. **Summary from the old provider.** The SDK restores `oldSession.checkpoint()` into a throwaway `createFxEngine({ checkpoint })` on the old provider and model, with no tools. Its instructions are the bot's instructions plus the previous handoff, and it asks for a handoff summary. The request keeps the user's requests in order, summarizes the replies, decisions, and facts, lists open tasks, and stays within about 1,500 words.
  2. **Fallback to the new provider.** If the old provider is gone, or the request fails or passes 2 minutes, a throwaway engine on the new provider writes the summary. It works from the transcript in `messages`: as many messages as fit half the new model's context when that is known, otherwise the last 100, plus the previous handoff.
  3. **The new session.** The bot gets a new session on the new agent, and the summary is saved as `profiles.handoff`. Every open of the session passes these instructions:
     - the bot's instructions
     - "Earlier conversation, summarized when this bot moved from <old> to <new>:" followed by the handoff
     - "Search earlier messages with chat_history."
  4. **The UI** shows "Continued from <old>" with the summary, collapsed, at the top of the new chat. The old session stays on disk for [past sessions](../../phases/past-sessions.md).
- **The `chat_history` tool** goes on every agent:
  - Its definition is `{ name: "chat_history", description, inputSchema: { query: string, limit?: 1–20 }, idempotent: true }`.
  - The bot comes from the session's `context` (`agent.session(id, { context: { bot } })`), never from the model's input. A bot searches only its own messages, across all of its sessions.
  - Its query is `where profile_id = $bot and tsv @@ websearch_to_tsquery('simple', $q)`, ordered by `ts_rank_cd`, then newest. It returns the date, role, and a `ts_headline` snippet.
  - Vector search arrives with [memories](../../phases/memories.md).

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `GET /api/providers` | `providers.list()`: records, plus `hasKey` or `signedIn` |
| `POST /api/providers` | `providers.add({ kind, name?, baseUrl?, apiKey?, model?, contextWindow? })`, for key and local kinds |
| `PATCH /api/providers/:id` | `providers.update(id, { name?, baseUrl?, apiKey?, model?, contextWindow?, teamId? })` |
| `DELETE /api/providers/:id` | `providers.remove(id)` |
| `GET /api/providers/:id/models` | `providers.models(id)`: `Model[]`, or the error with its reason |
| `GET /api/providers/:id/teams` | `providers.teams(id)`: Vercel teams, for `vercel` |
| `POST /api/sign-ins` | `signIns.start({ kind: "chatgpt" \| "grok" \| "vercel", provider? })` |
| `GET /api/sign-ins/:id` | `signIns.get(id)` |
| `DELETE /api/sign-ins/:id` | `signIns.cancel(id)` |

- Profile `PATCH` takes `provider` too. A changed provider runs the switch above and answers once the new session is ready.
- `createFxbot({ databaseUrl, secretKey, baseUrl?, apiKey?, vercelClientId?, dataDir?, fetch? })`.
  - The server passes `FXBOT_DATABASE_URL`, the contents of `FXBOT_SECRET_KEY_FILE`, `FXBOT_VERCEL_CLIENT_ID`, and the `env` variables.
  - `fetch` reaches sign-ins, model lists, and key checks, so the checks can run against stubs.
- `@fxbot/sdk/client` gains the same calls over HTTP, plus the `Provider`, `Model`, and kinds types. It carries no credentials.

### Where the code goes

- **`packages/sdk`:**
  - `store.ts`: the Postgres schema, and the queries for profiles, settings, providers, sent records, and images.
  - `import.ts`: the one-time import of v1's files.
  - `secrets.ts`: `seal`, `unseal`, `rotateSecrets`, and the secrets table.
  - `providers.ts`: records, one agent per provider, ChatGPT and Grok sign-ins, the refresh lock.
  - `vercel.ts`: device code, refresh, teams, and the request `fetch`.
  - `models.ts`: one source per kind, the caches, and the models.dev copy.
  - `history.ts`: the messages table, `chat_history`, and the handoff summary.
  - `index.ts`: picks a bot's agent and passes metadata and instructions.
- **`packages/server`:** the routes, `await` on every SDK call, and the `rotate-key` script.
- **`packages/ui`:**
  - A Providers section in Settings. Each row shows name, kind, key or sign-in, default model, context field, and team, with Sign in again, Replace key, Make default, and Remove.
  - An Add list like eve's `/login`.
  - The sign-in dialog, the key form, and the team select.
  - Provider and model selects in bot settings.
  - The "Continued from" note.
  - With no provider, an empty chat that points to Settings.
  - Components come from shadcn only.

### Built

What the build found or changed, checked against libfx 0.0.16 and the mocks:

- **Postgres.js.** Postgres.js 3.4.9 is pinned; 4.0.0 was three days old.
  - Its URL ignores libpq's `?host=` and sends it to the server as a parameter, which Postgres rejects.
  - The socket form is therefore `FXBOT_DATABASE_URL=postgres:///fxbot` with `PGHOST=/var/run/postgresql`. A check confirmed the server's connections have no client address.
- **Agent placeholder model.** Every agent gets the placeholder model `fxbot-unset`.
  - A durable session's `checkpoint()` opens an engine with the agent's own options, and a custom provider refuses one without a model.
  - Sessions always pass their own model, so the placeholder never reaches a request.
- **Checkpoint restore.** A checkpoint restores into `createFxEngine({ checkpoint })` on the same provider, and also on another custom provider. The original session carries on unchanged.
- **Tools and `supportsToolUse`.** libfx still offers tools to a model marked `supportsToolUse: false`. A server that rejects tools would fail that turn.
- **Images and `supportsVision`.** libfx refuses an image for a model marked `supportsVision: false` when the turn opens, not at send. The turn ends with "Image prompts are unavailable for the selected model", and nothing reaches the server.
- **The Vercel model list** goes through libfx's `listModels` with the account's `fetch`, instead of a direct call with `?teamId=`. Until a team is picked, it says so.
- **`chat_history`** leaves out the message that started the turn: that message is the search itself.
- **`chat_history`, after a bot used it.** Its feedback: a query needed every word in one message, it saw only snippets, and matches came best first, so it sorted dates itself. Changed after the build:
  - A message matching any word counts, more matches rank higher, and words match as prefixes.
  - The best matches come oldest first, each with its `msg:<id>` and "(earlier chat)" when it is from another session. The search still covers every chat of the bot, as designed.
  - `around: "msg:<id>"` reads that message and up to 6 on each side in its chat, in full, each cut at 4,000 bytes to stay under libfx's 64 KiB for a tool result, with the ids to page on.
- **Earlier chats stay readable.** After a switch the stream holds only the new session, and the old one may not open again: its provider can be gone. Fixed after the build: `profiles.earlier(id)` (`GET /api/profiles/:id/earlier`) reads the bot's other sessions from `messages`, with the files their messages sent, and the chat shows them above the handoff. The bot still sees only the summary and `chat_history`.
- **Engine turns** report only a stop reason; a failed request rejects instead.
- **`FXBOT_PORT`** lets a check run a server beside a running one.
- **OpenCode requests.** libfx's custom providers send no session id, and only `credentials()` learns a request's session.
  - For the OpenCode kinds, the key fxbot hands libfx carries the session id. The agent's `fetch` moves it into `x-opencode-session`, sets `user-agent: fxbot`, and masks the plain key in error bodies, since libfx would mask only the combined value.
  - Checked through libfx against a stubbed `opencode.ai`: the header is the bot's libfx session, the same across one conversation and different per bot.
- **A rejected key** shows in the chat as libfx's "host managed authentication failed · HTTP 401", and the key is in neither the stream nor the session files.
- **The import** runs whenever v1's files are present, and every insert skips what is already stored, so an import that stopped partway runs again without duplicates.
- **The import** has no end-of-replay marker from libfx, so it reads each session's stream until half a second passes with no new line.

### Security

- No secret is ever in the page, `@fxbot/sdk/client`, a Vite env, or a plain file. Sign-in state stays in the server's memory.
- Agents on the same machine:

  | Risk | What stops it |
  | --- | --- |
  | An agent reads or greps files, a database dump, or a backup; a bot's file tool lands somewhere | Sealing: only ciphertext is stored, and the key sits outside the repo |
  | An agent reads secrets or chats on purpose | Only OS users. The server runs as `fxbot`, the only user that can read the key, connect to the database, read `data/`, or read the server's memory and environment. Agents run as another non-root user, or in a container. An agent running as root, or as `fxbot`, can read everything. |

- `chat_history` searches only the bot named in the session's context.
- ChatGPT and Grok sign-in use libfx's built-in clients. Vercel uses fxbot's own registered app. The plan's or account's terms apply.
- fxbot still has no login. Anyone who can open the page, or any local agent that reaches `127.0.0.1:8787`, can add or remove providers and spend a plan, but cannot read a secret back.
  - Next steps for local agents: a local token, or a permissioned unix socket.
  - Before any route outside the tailnet: a backend login with an httpOnly cookie (fx0).
- Adding a provider makes the server fetch its base URL, which the URL rule limits to HTTPS, or HTTP on loopback.
- Removing a provider deletes its row. Tokens are not revoked at the provider.

### Size

Built: about 1,410 lines, against the estimate of 800. The core went from 1,264 lines to 2,678. The first estimate was 520 lines, and the decisions in section 5 grew it to 800; the code then came out larger than that. It adds one dependency, `postgres`, and one process, Postgres.

| Part | Estimate | Built |
| --- | --- | --- |
| `providers.ts` | 130 | 354 |
| `models.ts` | 90 | 177 |
| `store.ts`, plus `import.ts` | 140 | 102 + 68 |
| `history.ts` | 90 | 77 |
| `vercel.ts` | 60 | 87 |
| `secrets.ts` | 50 | 80 |
| Rest of the SDK (`index.ts`, `types.ts`, `client.ts`) | +40 | 290 + 71 + 135 (from 358) |
| Server | +55 | 152 + 15 (from 130) |
| UI (`app.tsx`, `providers.tsx`) | +200 | 666 + 326 (from 629) |

The biggest places to trim are the provider rows and dialogs in `providers.tsx`, and the per-kind branches in `providers.ts`.

## 4. Checklist

Build in this order. Done means every box is ticked, with its check run. The checks use:
- a local Postgres
- a fresh database for each run (`createdb fxbot_check_<n>`)
- disposable `FXBOT_DATA`
- the mock Chat Completions server
- stubbed `fetch` responses shaped like section 1

They never use a real account or key.

**M1. Postgres store** (44 checks passed)
- [x] The tables exist, and every v1 route still behaves the same against Postgres: profiles, settings, messages with files, images, the stream, previews.
- [x] On a copy of v1 data, the import moves profiles, settings, sent records, and images. It fills `messages` from each session's stream, moves the files to `data/imported/`, and an open turn resumes after a restart.
- [x] The server refuses to start without `FXBOT_DATABASE_URL`. It connects over the socket with peer auth and no password. The exact URL form goes in the README.
- [x] An import that runs again, with the files put back, adds no duplicates and sets the files aside again.

**M2. Secrets** (20 checks passed)
- [x] Add a provider with a key, then grep `data/`, a `pg_dump`, every API response, and the built page for the key. It appears in none of them.
- [x] A row copied onto another provider's id fails to open. A wrong key marks that provider, and the server keeps running.
- [x] `npm run rotate-key` seals every row again, and the server opens them with the new key.

**M3. Providers and models** (28 API checks, 20 model-source checks, and 10 OpenCode checks passed)
- [x] The kinds table and types exist. The `env` provider works, and the bots from v1 get it.
- [x] Two mock servers, as two providers with a bot on each, both reply. Removing a provider in use is refused.
- [x] Each kind returns the right ids and fields from stubbed responses:
  - Codex: hidden entries are dropped.
  - Grok: only `responses`-backend models are kept.
  - OpenCode: Anthropic- and Google-API models are dropped.
  - Ollama: only `completion` models are kept.
- [x] The context field overrides the probe. The 5-minute cache works, and a failed list returns its reason.
- [x] Known metadata reaches `provider.models` before a turn.
- [x] Key check: a 401 refuses the provider, a 404 is accepted, and a non-loopback `http:` URL is refused before any fetch. The key is masked in every error.
- [x] OpenCode, through libfx against a stubbed `opencode.ai`:
  - Keys are checked at OpenCode's own lists.
  - Every Go request carries the conversation's `x-opencode-session` and `user-agent: fxbot`, with the plain key.
  - A rejected key stays out of the stream and the session files.

**M4. Sign-in** (28 checks passed)
- [x] ChatGPT and Grok, against stubbed `auth.openai.com` and `auth.x.ai`:
  - `POST /api/sign-ins` returns exactly `id`, `verificationUrl`, `userCode`, and `expiresAt`.
  - The status goes from `waiting` to `done`, and writes the provider and its sealed secret.
  - An expired code gives `failed` with libfx's message.
  - Cancel and a second start both work.
  - Signing in again keeps the bots' sessions.
- [x] Vercel, against stubbed `api.vercel.com`:
  - It handles `authorization_pending` and `slow_down`, and refuses a verification URL not on `vercel.com`.
  - A single team is picked automatically, and several teams need a choice.
  - Each request carries the bearer and team headers, and a token quoted in an error body is masked.
- [x] Refresh: the tokens libfx refreshes are saved. The SDK's own refreshes, for plan model calls and Vercel, run under the shared lock, so two refreshes at once spend one refresh token.

**M5. History and provider switches** (19 checks passed)
- [x] Messages are recorded at send and at turn end.
- [x] `chat_history` finds a word in an older session of the same bot, and nothing from another bot, even when the model asks for one.
- [x] Switching a bot from mock A to mock B: the summary comes from A, by checkpoint restore. With A stopped, it comes from B, from the transcript. The new session's instructions carry it, and a second switch carries the first summary forward.

**M6. UI** (Playwright against the mocks; 26 checks passed)
- [x] Add a local provider, with a context field, pick a model, and get a reply.
- [x] The sign-in dialog shows the stubbed code and closes on `done`. The Vercel team select appears when there are several teams.
- [x] The key field is empty after saving, and the row says the key is saved.
- [x] Switching a bot's provider shows "Continued from" with the summary.
- [x] With no provider, the chat points to Settings.

**M7. Docs and checks** (done)
- [x] Update the README (setup, the env table, providers), `packages/sdk/README.md`, CONVENTIONS.md (one fxbot process plus Postgres; store calls are async), and this page's line counts. Also updated: `AGENTS.md` and `packages/AGENTS.md`.
- [x] `npm run typecheck`, `npm run build`, and `git diff --check` pass, and new files get a look.

**The human runs these**
- Register fxbot's Vercel OAuth app with the device code grant, and set `FXBOT_VERCEL_CLIENT_ID`.
- Sign in to ChatGPT, Grok, and Vercel, with a turn on each.
- One turn each on an OpenAI key, an OpenCode Zen key, and an OpenCode Go key.
- An image to a plan model.
- A provider switch between two real providers.
- Run the server as `fxbot` and an agent as another user. That agent cannot read the key, connect to the database, or read `data/`.

**Left out of this phase**
- Paste-the-address sign-in.
- OpenCode console login.
- GitHub Copilot.
- An Anthropic key.
- Reasoning effort and fast-mode controls.
- More than one credential per provider.
- `pgcrypto`.
- Vector search.
- Moving libfx sessions into Postgres.
- A backend login, and a local API token.

## 5. Decisions

Answered on 2026-11-01.

| Question | Decision |
| --- | --- |
| Line budget | Build as planned. The decisions here bring it to about 800 lines. Built, it came to about 1,410 (see **Size**). |
| Provider switch | Compact and carry the summary over. The messages stay in Postgres, searchable with `chat_history`. |
| Who writes the summary | The old provider, falling back to the new one |
| What lives in Postgres | Everything fxbot owns. libfx sessions stay files. |
| Agents and OS users | The server runs as `fxbot`, and agents run as a non-root user |
| `chat_history` scope | This bot's chats only |
| Ollama context | A context field per provider, overriding the probe |
| Extra logins | Add a Vercel account login. OpenCode uses keys only, with no console login. |
| Codex model list | `client_version` from npm, read daily; no `originator` |
| Search | Postgres full-text now. Hybrid search (pgvector plus full-text, fused with reciprocal rank fusion) arrives with memories, with the embedding model picked in Settings from any provider that serves `/embeddings`. |
| Key rotation | A `rotate-key` command |

Answered by the build:
- A durable session's `checkpoint()` restores into `createFxEngine`, on the same custom provider and on another. It needs a model on the agent (see **Built**).
- libfx still offers tools to a model with `supportsToolUse: false`.

Still to confirm, with real accounts:
- Whether Vercel allows device code for a third-party OAuth app without a client secret. OIDC lists auth method `none`. If a secret is required, it is stored like the key file.
- Whether Codex accepts the model call without `originator`.
- Whether a ChatGPT or Grok session's checkpoint restores for the switch summary. If it does not, the summary comes from the transcript.
- Whether images reach a plan model.
- Device code sign-in against real accounts.
