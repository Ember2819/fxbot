# MCP servers

Add any remote MCP server to fxbot, by its URL or from [add-ons](addons.md). fxbot connects from the server, signs in with OAuth when the server asks, and gives the server's tools to the bots that use it. A server can also serve [skills](skills.md). Local MCP servers, which run code on this machine, come in [plugins](../../phases/plugins.md), and plugins can bundle remote servers too.

The hard part is signing in. fxbot runs on a tailnet or on localhost, with no public address, and the project should not have to register its own OAuth client with every MCP provider. This page answers that: [section 2](#2-key-takeaways) in short, [OAuth sign-in](#oauth-sign-in) in full.

Status: built on 2026-11-01, and checked against mock MCP servers built on `@modelcontextprotocol/server`, a mock authorization server, a mock model, and disposable databases: 67 checks, all passing (section 4), after the follow-up below. No real account was used; those sign-ins are the owner's. Where the build differs from the plan, section 3 says so under **Built**. It is the first add-on phase, so it created the add-on tables ([add-ons: Postgres](addons.md#postgres)) and a first Add-ons page, with Add by URL and the installed list, which [add-ons](addons.md) extends with search. Its read-only trust stands in for [permissions](../../phases/permissions.md) until that phase ships.

## 1. Research

These are read from specs, source, docs, and read-only requests, as of November 2026. Paths are relative to each repository.

**The MCP spec** (current revision 2026-07-28, [versioning](https://modelcontextprotocol.io/specification/versioning))
- **[Client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).** Clients that support all options SHOULD try them in this order:
  1. A pre-registered client: one the client ships, or one the user "registered … themselves" and enters in a UI.
  2. A Client ID Metadata Document (CIMD), when the authorization server advertises `client_id_metadata_document_supported`.
  3. Dynamic Client Registration (DCR, RFC 7591) "as a fallback".
  4. Asking the user to enter client information.
- **CIMD.** It is SHOULD. The `client_id` is an HTTPS URL with a path, pointing at a JSON document with `client_id`, `client_name`, and `redirect_uris`. The authorization server fetches it and MUST validate redirect URIs against it.
- **DCR.** It "is deprecated" and kept "for backwards compatibility".
  - Clients MUST send an `application_type`. Use `"native"` for "locally-hosted web applications accessed via `localhost`", and `"web"` for "remote browser-based applications served from a non-local host".
  - Credentials from DCR or pre-registration are bound to the authorization server's `issuer`, and MUST be registered again when it changes.
- **Flow.** Discovery uses RFC 9728 protected resource metadata (the `resource_metadata` in a 401's `WWW-Authenticate`), then RFC 8414 or OIDC discovery. The `resource` parameter (RFC 8707) and PKCE S256 are required. Redirect URIs are localhost or HTTPS.
- **No device flow.** The authorization pages have none.
- **[Lifecycle](https://modelcontextprotocol.io/specification/2026-07-28/basic/lifecycle).** Servers "MUST implement `server/discover`", and requests carry their own `_meta` in place of an `initialize` session. Clients that support both eras probe with `server/discover`, and fall back to `initialize` for servers on 2025-11-25 and earlier.
- **Skills.** The `io.modelcontextprotocol/skills` extension lets a server serve skills through `skills/list`, `skills/get`, and `resources/read` ([skills](skills.md#1-research)).
- **[Security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices).**
  - Discovery makes the client fetch URLs that a server names (`resource_metadata`, authorization servers), so a client on a server must guard against SSRF.
  - Script injected into a web client can run commands through a proxy that starts local servers. That matters for [plugins](../../phases/plugins.md).

**What servers support** (each server's metadata, fetched read-only; nothing registered)
- **Both mechanisms.** Of 31 endpoints that need auth, 24 support DCR, and 14 of those also advertise CIMD: Notion, Linear, Sentry, Cloudflare, Vercel, Canva, monday, Neon, Hugging Face, PostHog, Context7, Exa, Airtable, and Todoist.
  - Checked again here: `mcp.linear.app` and `mcp.notion.com` list both `registration_endpoint` and `client_id_metadata_document_supported: true`, with PKCE S256.
- **Neither.** GitHub ("Dynamic Client Registration is NOT supported", [host integration](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)), Slack, Asana v2, HubSpot, Box, and Google BigQuery and Maps. These take a token, or an OAuth app the user registers.
  - GitHub's endpoint does answer 401 with `resource_metadata`, checked here.
- **Restrictions.**
  - Figma admits only clients in its catalog, and Vercel only "reviewed and approved" clients.
  - Atlassian accepts redirect origins from an allowlist that defaults to localhost, and serves no RFC 9728 metadata.
- **Static tokens.** GitHub takes a personal access token, Stripe an agent key, Linear "API keys directly in the `Authorization: Bearer`" header, and Supabase a personal token. Registry entries mark secret headers with `isSecret` ([add-ons](addons.md)).

**libfx 0.0.16** (`libfx/mcp`, installed)
- `createMcpAdapter(client, { prefix, serverName, resources, prompts })` resolves to `{ tools, instructions, close }`, built from "a host-owned MCP client". Transport, authentication, elicitation, and cleanup stay with the host.
- Every adapted tool has `idempotent: false` ("set it to `true` on a tool known to be safe to run twice").
- It calls `client.callTool(params, undefined, { signal })`: the v1 SDK's shape.
- An agent's tools are fixed when `createFxAgent` runs. `agent.session()` varies only `context`, `model`, and `instructions`.

**The MCP TypeScript SDK**
- **v1 (`@modelcontextprotocol/sdk` 1.32).** It has client OAuth through `OAuthClientProvider`, with `clientMetadataUrl` for CIMD and `saveTokens`. But it depends on express, hono, cors, and more.
- **v2 (`@modelcontextprotocol/client`).** It is client-only: zod, jose, pkce-challenge, eventsource, and cross-spawn. 2.4.0, from 2026-10-23, ships the skills extension.
  - Its `callTool(params, options)` needs a 3-line shim for libfx's call.
  - opencode uses its `auth()` and `OAuthClientProvider`.

**References**
- **fx CLI.**
  - Order: pre-registered, then CIMD ("None until fx hosts one"), then DCR, which registers `native` with `http://127.0.0.1:<free port>/callback` (`src/mcp/auth/client.zig`).
  - `fx mcp login --no-browser` takes a pasted address. Tokens go to the Keychain or `~/.fx/mcp-credentials/`.
  - Its only fixed client id is its own Slack app's.
- **Claude Code** ([MCP docs](https://code.claude.com/docs/en/mcp)).
  - Chooses CIMD or DCR on its own, with a random localhost port or `--callback-port`.
  - Takes `--client-id` and `--client-secret`, and falls back to a pasted address (`--no-browser`).
  - It publishes one CIMD document for every install, fetched here: `https://claude.ai/oauth/claude-code-client-metadata`, with `redirect_uris` `http://localhost/callback` and `http://127.0.0.1/callback`, and `token_endpoint_auth_method: none`.
- **opencode.**
  - Order: a configured `client_id`, then CIMD, then DCR. It listens on a random 127.0.0.1 port unless `callback_port` is set, and reuses an earlier DCR client (`packages/core/src/mcp/oauth.ts`).
  - Its one document, `https://opencode.ai/oauth/opencode/client.json`, adds `http://127.0.0.1/mcp/oauth/callback`.
- **eve** (`docs/connections/index.mdx`).
  - Remote connections only. Vercel Connect stores tokens off the machine.
  - `defineInteractiveAuthorization` leaves storage to the host.
  - Each connection has `tools.allow`, `tools.block`, and `approval` policies.
- **openbot and OpenDots.** openbot takes only https MCP URLs and checks every call against grants. In OpenDots, tools without `readOnlyHint` default to "Ask first".
- **Borrowing a client.** Using another app's published client id is the impersonation that the CIMD security notes warn about.

## 2. Key takeaways

1. **fxbot never registers itself with a provider ahead of time.** No mechanism needs it:
   - With DCR, each install registers itself with each authorization server, and the server issues the id.
   - With CIMD, the client id is one public document the project hosts once.
   - Where neither exists, the user registers their own OAuth app, as the spec's pre-registration allows.
2. **Where the browser is decides the redirect.** The browser is usually a phone on the tailnet: not on the server's loopback, but able to reach `https://<machine>.<tailnet>.ts.net`.
   - A redirect to that origin lands on fxbot with nothing to paste. Only a per-install registration can name it, which means DCR or the user's own app; a shared CIMD document cannot.
   - Loopback redirects work with one shared CIMD document, but a phone has to paste the address of the page that failed to load.
3. **Order of attempts:**
   1. The user's own client, when they entered one.
   2. DCR with a callback on the page's own HTTPS origin, such as the tailnet address. It covers most servers today, and works without a paste on a phone.
   3. CIMD with loopback redirects: captured directly when the browser runs on the server, pasted otherwise.
   4. DCR `native` with loopback.
   5. A static token.
   - This puts DCR ahead of the spec's SHOULD order, because CIMD cannot name a per-install callback. CIMD carries on when DCR goes away (the SDK's notes give 2027-07-28 as the earliest).
4. **Sign-in runs on the server** as an attempt the page polls, as in provider logins. The verifier and tokens never reach the page, and tokens are sealed.
5. **libfx only adapts a client.** fxbot owns the transport, sign-in, reconnects, and shutdown, through `@modelcontextprotocol/client`, whose `auth()` does discovery, PKCE, DCR, and CIMD.
6. **Tools are fixed per agent** (libfx). Adding, removing, or changing a server's allowed tools rebuilds the provider agents. Whether a bot uses a server is decided inside each tool's `execute()` ([add-ons: bots](addons.md#bots-and-add-ons)).
7. **MCP tools are untrusted** and not safe to run twice. Until [permissions](../../phases/permissions.md) ships, bots get only a server's read-only tools until the owner allows others by name.
8. **Adding a URL makes the server fetch it.** fxbot takes HTTPS only, and refuses private and tailnet addresses unless the user allows one.

## 3. Implementation

### Adding a server

- From [add-ons](addons.md): a registry entry's `remotes` (`streamable-http` or `sse`, a URL, `headers` marked `isSecret`). Or "Add by URL".
- The SDK checks the URL, HTTPS and not private (see Security). Then it probes the server without credentials, with `server/discover`, or `initialize` for older servers. The add-on page shows what the probe finds, including whether the server serves skills:
  - **It answers:** no auth.
  - **401 with `resource_metadata`:** OAuth.
  - **Secret headers in the registry entry:** the page asks for their values in password fields, and they are sealed.
  - **Otherwise:** the user can add a header by hand, such as `Authorization: Bearer <token>`.
- The record is an add-on of kind `mcp` ([add-ons: Postgres](addons.md#postgres)) holding:
  - `url` and `transport`
  - header names only
  - `auth` (`none`, `headers`, or `oauth`)
  - `allowed` (the tool names bots get; none set means the read-only ones), and `bots` (`all`, or `each` for chosen bots)
  - `source` (a registry name and version, or "url")
  - `status`

### OAuth sign-in

`packages/sdk/src/mcp.ts` implements the SDK's `OAuthClientProvider` against fxbot's store. Instead of opening a browser, it hands the authorization URL to the page.

1. `POST /api/addons/:id/sign-in`. The SDK reads the protected resource metadata, then the authorization server's, and picks a client in this order:
   1. **The user's own client,** if one was entered for this add-on: a client id, and a secret if the server issued one.
   2. **DCR with the page's callback,** when the server has a `registration_endpoint` and the page's origin is HTTPS: `application_type: "web"`, `redirect_uris: ["<origin>/api/oauth/callback"]`, `client_name: "fxbot"`, `token_endpoint_auth_method: "none"`.
   3. **CIMD,** when the server advertises it: `client_id` is the project's document (see below), and the redirect is loopback.
   4. **DCR `native`** with `http://127.0.0.1:<port>/callback`.
   5. **None of these:** the page asks for the user's own client id, and shows the callback URL to register.
   - Registered clients are sealed and keyed by `issuer` and redirect URI, and registered again when either changes.
2. The SDK builds the authorization URL with PKCE S256, a `state`, the `resource` (RFC 8707), and scopes from the metadata.
   - The verifier stays in the server's memory with the attempt.
   - The page gets `{ id, url, mode: "redirect" | "paste", expiresAt }`. Attempts expire after 10 minutes, and a new one cancels the old.
3. **Redirect mode.** The page opens `url` in a new tab. After consent, the authorization server sends the browser to `<origin>/api/oauth/callback?code&state&iss`.
   - The server matches `state`, checks `iss` (RFC 9207), and exchanges the code with the verifier and `resource`.
   - It seals the tokens and answers with a short "Connected. You can close this tab."
4. **Paste mode** (loopback redirects):
   - **Browser on the server:** the API server answers the loopback `/callback` itself. The CIMD document's loopback URIs have no port, and RFC 8252 says a server must allow any.
   - **Browser on a phone:** the page asks for the address of the page that failed to load, and the server reads `code` and `state` from it, as libfx's ChatGPT sign-in does.
5. The page polls `GET /api/oauth/attempts/:id` until the status is `done` or `failed`. Failures carry the server's reason.
6. **Refresh.** Tokens are refreshed before expiry and once after a 401, under a lock per add-on, as in provider logins. When a refresh fails, the add-on shows "Sign in again".

**The CIMD document.** One static file on the project's public site (GitHub Pages; the owner publishes it):

```json
{
  "client_id": "https://<project pages>/oauth/client.json",
  "client_name": "fxbot",
  "client_uri": "https://<project pages>/",
  "redirect_uris": ["http://127.0.0.1/callback", "http://localhost/callback", "http://127.0.0.1:8787/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

The fixed-port URI is for servers that match ports exactly. Until the document exists, fxbot skips CIMD and uses the other paths.

### Tools for bots

- Each enabled server gets one client: Streamable HTTP, or SSE for `sse` remotes. It goes through a shim that gives libfx the `callTool(params, undefined, { signal })` call, then into `createMcpAdapter(client, { prefix: "<slug>_", serverName })`.
- Each adapted tool's `execute()` is wrapped, in this order:
  1. With `bots` set to `each`, is the bot in `context.bot` chosen? If not: "This tool is off for this bot."
  2. Is the tool still allowed? A tool that isn't is left out of the agents' lists, and this catches a call during the rebuild.
  3. The [permissions](../../phases/permissions.md) check, when that phase ships.
- `idempotent` stays `false`, except for tools with `readOnlyHint: true` and `idempotentHint: true`.
- The adapter's `instructions` go into the instructions of bots that use the server.
- **Skills.** When the server declares the skills extension, its skills join the add-on, labelled with the server, and bots read them through it ([skills](skills.md#5-open-questions)).
- **Changes.** Adding, removing, enabling a server, or changing its allowed tools rebuilds every provider agent with the new tool list, since libfx fixes tools when an agent is made. Rebuilding closes each agent first, which waits for its running turns.
- **Connections.** A dropped connection is retried with backoff. Its tools then fail with "<server> is unreachable", and the add-on shows the error.

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `POST /api/addons/preview` with `{ url \| registry }` | `addons.preview(ref)`: probes the server for the add-on page |
| `PUT /api/addons/:id/secrets` | `addons.setSecrets(id, { headers?, clientId?, clientSecret? })`: write-only |
| `POST /api/addons/:id/sign-in` | `oauth.start(id)` |
| `GET /api/oauth/attempts/:id` | `oauth.get(id)` |
| `POST /api/oauth/attempts/:id/paste` | `oauth.paste(id, address)` |
| `GET /api/oauth/callback` | `oauth.callback(query)`: the redirect target, answered with a small HTML page |

Adding, listing, enabling, allowing tools, choosing bots, and removing are the [add-ons](addons.md#api-sdk-and-client) routes. The callback is the one route that a browser reaches from another site, so it does nothing without a matching, unexpired `state`.

### Where the code goes

- **`packages/sdk`**
  - `mcp.ts`: clients, the provider adapter for OAuth, attempts, and tool wrapping.
  - The add-on records it needs (see [add-ons](addons.md)).
  - `index.ts` passes MCP tools into provider agents.
- **`packages/server`:** the routes above. A sign-in takes the request's `Origin`, after the server's check that a write's origin matches the address it came in on.
- **`packages/ui`:** a list of servers with an edit button and an on switch, an add dialog, each server's settings (sign-in or key, bots, tools), and the sign-in dialog (open a tab, or paste).
- **Dependency:** `@modelcontextprotocol/client` 2.4.0 or later, for the skills extension, pinned exactly.

### Security

- **Credentials.** Tokens, registered clients, and secret headers are sealed (`secrets.ts`) and never returned. The SDK sends a token only to the MCP server it was issued for.
- **Sign-in checks.** PKCE, `state`, `iss`, and `resource` are checked on every sign-in, and the callback rejects unknown or used states.
- **SSRF.** fxbot takes HTTPS only. It refuses loopback, private, link-local, `100.64.0.0/10`, and `*.ts.net` addresses unless the add-on says "allow local address", which the user sets after a warning. The address is checked again after DNS resolution, and the same check covers every URL that discovery and sign-in fetch.
- **Untrusted tools.** Tool results can carry prompt injection. Only read-only tools are allowed until the owner picks, and the [permissions](../../phases/permissions.md) phase adds ask, auto, and yolo.
- **Writes from other sites.** A browser names the page's origin on every write, and the server refuses one whose origin doesn't match the address the request came in on. A site open in the same browser cannot add a server or start a sign-in. Tools without a browser send no origin, and pass.
- **The tailnet name.** The page's MagicDNS name is already public in Certificate Transparency logs, so naming it in a registration reveals nothing new. Renaming the machine means registering again.
- **No borrowed clients.** fxbot never uses fx's, Claude Code's, or opencode's client ids.

### Built

What the build found or changed, checked against `@modelcontextprotocol/client` 2.4.0, libfx 0.0.16, and the mocks:

- **fxbot carries the credentials, not the SDK's transport.**
  - libfx's `createMcpAdapter` returns tools without their MCP annotations, so `mcp.ts` keeps each server's last listing. It reads `readOnlyHint` and `idempotentHint` from that listing, and the listing keeps a server's tools with the bots while it is away.
  - Each server's requests go through fxbot's own fetch. It adds the header values and the token, sends them only to the server's own origin, checks every address it reaches, and renews tokens under a lock per add-on.
  - The SDK's `auth()` runs only the interactive sign-in: discovery, registration or the metadata document, PKCE, `state`, `iss`, and the code exchange.
- **Both protocol eras.** The client probes with `server/discover` (`versionNegotiation: { mode: "auto" }`) and falls back to `initialize`. The mocks use `@modelcontextprotocol/server`'s `createMcpHandler`, which serves both eras.
- **PKCE.** The SDK refuses a server only when `code_challenge_methods_supported` lacks S256. fxbot also refuses one that leaves the field out, as MCP requires.
- **Renewing tokens.**
  - A token is renewed within 5 minutes of expiring, or within half its life when it lives less than 10 minutes. Otherwise a one-minute token would be renewed on every request.
  - A renewal the authorization server refuses (`invalid_grant`, `invalid_client`, `unauthorized_client`) drops the tokens, and the add-on asks for a sign-in.
  - One that cannot reach the server, or gets a 5xx, keeps them, and the add-on retries with backoff.
- **Rebuilds.** Adding, removing, enabling, a change to the allowed tools, and a changed tool listing make the agents again; choosing bots doesn't, since it is checked inside each call. A turn that asks for an agent during a rebuild waits for the new one.
- **No text from servers yet.** libfx's adapter builds `instructions` only from resources and prompts, which this phase leaves out ([question 6](#5-open-questions)), so bots get none. A server's own `instructions` field isn't used either.
- **Names and prefixes.** A server is named by its server info, its RFC 9728 `resource_name`, or its host. The tool prefix comes from that name: "mcp.linear.app" gives `linear`, and an IP address gives `local`. A prefix is unique among add-ons, and never `chat` or `library`.
- **Settings.** `FXBOT_CLIENT_METADATA_URL` names the published metadata document; without it, fxbot skips CIMD and registers with DCR. `FXBOT_MCP_REGISTRY` sets the registry, GitHub's by default. A registry entry can also allow a local address.
- **Addresses.**
  - `localhost`, `*.localhost`, and `*.ts.net` are refused by name, before any lookup. Other names are refused by the addresses they resolve to, and redirects are checked again, up to five.
  - The resolved address isn't pinned: fetch resolves the name again, so an answer that changes in between isn't caught.
- **The loopback callback** is the API's own `GET /callback`, at `http://127.0.0.1:<FXBOT_PORT>`.
- **A key instead of OAuth.** Some servers publish OAuth metadata but also take a key, such as `Authorization: Bearer <key>`. The add dialog offers "Use a key instead", and a server added with named headers uses them, not OAuth.
- **Follow-up: the page's origin, allowed tools, and chosen bots.** After the first build:
  - `FXBOT_PUBLIC_URL` is gone. A sign-in comes back to the page's own origin, read from `Origin` once the server's origin check passed. Only an HTTPS origin is used, as `tailscale serve` gives; a plain-http page, as on the machine itself, signs in with the loopback redirect. This also covers `npm run prod` on its own port.
  - `trust` became `allowed`, a list of tool names. A tool not allowed is left out of the agents. An old `trust = 'all'` was migrated to every listed tool.
  - `bots` is `all` or `each`. With `each`, a bot gets the server only when switched on, in the server's settings or the bot's. Switching to `each` starts with no bot chosen.
  - The page is a list with an edit button per server, an Add dialog that asks only for the address (the local-address switch shows once one is refused), and one field for a key: a bearer token, or `Name: value` for another header. The person's own OAuth app is asked for only when a sign-in cannot start.
  - The service worker no longer answers `/callback`, so a loopback sign-in in the installed production app reaches the server.
- **Skills from servers wait for the [skills](skills.md) phase.** The probe doesn't report whether a server serves skills yet, and none are read.
- **Wording.** A server whose renewal was refused shows "Sign in to use it", with a Sign in button, rather than "Sign in again". A server with no client to register shows its callback URL in the sign-in error, and the card takes the person's own client.
- **Secrets.** `createSecrets` takes the table now: add-ons seal into `addon_secrets`, with the add-on id as AAD, and `rotateSecrets` seals both tables again.
- **The page.** The puzzle button beside the library opens Add-ons, and a bot's settings list every server with a switch. shadcn's Switch and Checkbox were added for them.

### Size

Built: about 1,340 lines after the follow-up, against the estimate of 450, nearly three times over. The estimate assumed the SDK's transport would carry the credentials and libfx's adapter would keep the tool annotations. Neither does, so `mcp.ts` holds its own fetch, renewal, reconnects, and listings. It adds one dependency, `@modelcontextprotocol/client`, and no process.

| Part | Estimate | Built |
| --- | --- | --- |
| `mcp.ts` | 220 | 668 |
| SDK wiring: `index.ts`, `store.ts`, `providers.ts`, `secrets.ts`, `types.ts` | | +135 |
| Server routes and the callback page | 40 | +46 |
| Client | 25 | +42 |
| UI: `addons.tsx` and `app.tsx` | 170 | 425 and +10, plus shadcn's Switch and Checkbox |

## 4. Checklist

Checks use the mock Chat Completions server, a mock MCP server (Streamable HTTP, built on `@modelcontextprotocol/server` in the scratchpad), and a mock authorization server. The mock serves RFC 9728 and RFC 8414 metadata, DCR, a CIMD fetch, and PKCE. No real accounts.

**M1. Connect**
- [x] A server with no auth: added by URL, tools listed with the prefix, and a bot calls one.
- [x] A server with a secret header: the value is sealed, sent on every request, and never returned. A registry entry's `isSecret` headers become password fields.
  - The registry entry's header comes back marked secret. The page shows a header's value as a password field, checked through Add by URL; registry entries reach the page with add-ons' search.
- [x] An `http:` URL, or a loopback, private, or `*.ts.net` address, is refused unless allowed. A hostname that resolves to a private address is refused too.

**M2. OAuth**
- [x] DCR with the page's callback: registration sends `application_type: "web"` and the page's HTTPS origin's callback URI. The browser lands on `/api/oauth/callback`, and the tokens are sealed.
- [x] CIMD: the mock fetches the document, and the loopback redirect is captured directly. With the browser elsewhere, the pasted address finishes the sign-in.
- [x] A user's own client id and secret are used first when present.
- [x] Bad `state`, a missing PKCE method, a wrong `iss`, or an expired attempt all fail cleanly.
  - The expired attempt was checked on an fxbot made inside the check, whose clock jumped 11 minutes.
- [x] A refresh before expiry and after a 401. Two refreshes at once spend one refresh token. A changed `issuer` registers again.
  - With 4-second tokens: unused for 2 seconds, then renewed before they expire. Two calls at once shared one renewal, and no refresh token was spent twice.

**M3. Tools for bots**
- [x] A server for chosen bots refuses its tools in a bot not chosen, and a chosen bot uses them. Back to all bots, every bot does.
- [x] By default only `readOnlyHint` tools are in the bots' lists. A tool allowed by name joins them and runs; one taken out leaves them.
- [x] Adding or removing a server rebuilds the agents, and a running turn finishes first.
  - A 4-second tool call ran while its neighbor was removed, and finished. The next turn had the new tool list.
- [x] A dropped connection retries with backoff, and its tools fail with the reason.

**M4. UI and docs**
- [x] Playwright: add by URL, sign in through the mock in a second tab, allow a tool and choose a bot in the server's settings, add a server with a key, call the allowed tool from a chat, and paste-mode on a phone viewport.
- [x] README, the SDK README, and `npm run typecheck`, `npm run build`, `git diff --check`.

**Also checked:**
- Without the page's origin, or with a plain-http one, DCR registers a `native` client with a loopback redirect.
- A write from another site's page, or with a `null` origin, is refused with 403; the same site and tools without a browser pass. Checked again through `tailscale serve` and Vite.
- The same callback a second time is refused.
- An authorization server that is down keeps the tokens, and the add-on reconnects once it is back. A renewal it refuses asks for a new sign-in.
- A bot's settings show a switch for a server given to chosen bots and "All bots" for the rest, and the page shows no errors.

**The human runs these:** publish the CIMD document. Then sign in to Linear or Notion (DCR and CIMD), GitHub with a personal token, and one Atlassian site, where an admin may need to allow the callback origin.

## 5. Open questions

Each has a default, and the build took every one. Until the owner publishes the metadata document, its address is a setting, `FXBOT_CLIENT_METADATA_URL`, and fxbot skips CIMD without it.

1. **Callback origin.** Is it set by hand, or read from `tailscale status`? *Answered:* neither. It is the page's own origin, checked by the server.
2. **The CIMD document.** Where does the public document live? *Default:* the project's GitHub Pages site, whose domain also gives fxbot's plugin namespace ([plugins](../../phases/plugins.md#5-open-questions)). The owner publishes it.
3. **Trust before permissions.** *Answered:* read-only tools only, until the owner allows others by name.
4. **Per-bot default.** *Default:* a new server is on for every bot. See [add-ons](addons.md#bots-and-add-ons) for why every bot still sees its tool list.
5. **Private addresses.** *Default:* refused, with an "allow local address" switch per add-on.
6. **Elicitation, sampling, resources, and prompts.** *Default:* none in this phase, apart from the skill files that the skills extension serves through `resources/read`. libfx can turn resources and prompts into instructions later.
