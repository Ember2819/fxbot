import {
  auth,
  Client,
  discoverOAuthServerInfo,
  OAuthError,
  ProtocolError,
  refreshAuthorization,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type AuthorizationServerMetadata,
  type FetchLike,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type OAuthTokens,
  type StoredOAuthClientInformation,
  type Tool,
} from "@modelcontextprotocol/client";
import type { FxAgentHostTool } from "libfx";
import { createMcpAdapter } from "libfx/mcp";
import { createHash, randomBytes } from "node:crypto";
import { infoOf, type Entry } from "./registry.ts";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { createSecrets } from "./secrets.ts";
import { newId, type PluginRecord, type Store } from "./store.ts";
import type { RegistryFrom, McpPreview, PluginRef, PluginSecrets, McpPlugin as Plugin, OAuthAttempt, OAuthStatus, RepoRef, SkillRef, Transport } from "./types.ts";

const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

// A server's record. `tools` is its last listing, so its tools stay with the bots while it is away, and `prefix`
// starts each tool's name, unique among plugins.
// A server by its address, or a registry entry.
type McpRef = Exclude<PluginRef, SkillRef | RepoRef>;
type Config = { url: string; transport: Transport; headers: string[]; auth: Plugin["auth"]; allowLocal: boolean; prefix: string; tools: Tool[] };
type McpRecord = PluginRecord<Config>;
// Sealed per plugin: header values, the person's own OAuth client, clients registered by issuer and redirect URI,
// and the tokens with what renewing them needs.
type Secret = {
  headers?: Record<string, string>;
  own?: StoredOAuthClientInformation;
  clients?: Record<string, StoredOAuthClientInformation>;
  tokens?: OAuthTokens & { expiresAt?: number };
  session?: { client: StoredOAuthClientInformation; authorizationServerUrl: string; metadata?: AuthorizationServerMetadata; resource?: string };
};
// A sign-in in progress. What claims the tokens stays here, never in the page.
type Attempt = OAuthAttempt & {
  pluginId: string;
  state: string;
  redirectUrl: string;
  clientMetadataUrl?: string;
  applicationType?: "web" | "native";
  verifier?: string;
  discovery?: OAuthDiscoveryState;
  resource?: string;
  client?: StoredOAuthClientInformation;
  status: OAuthStatus;
  used: boolean;
};

export type McpOptions = {
  store: Store;
  secretKey: Buffer;
  fetch: typeof fetch;
  /** The server's own origin on this machine, for sign-ins that come back to its loopback /callback. */
  localUrl: string;
  /** The project's client ID metadata document, once it is published. */
  clientMetadataUrl?: string;
  /** A registry entry by name, from where it came, or null when there is none. */
  findEntry: (name: string, from: RegistryFrom, version: string) => Promise<Entry | null>;
  /** The tools bots can use have changed. */
  onChange: () => void;
  /** Names other plugins' tools start with, which a server's prefix must not take. */
  reserved?: () => string[];
};

// Addresses a server's URL must not reach unless its plugin allows local addresses: this machine, private networks,
// link-local, and the tailnet's 100.64.0.0/10.
const local = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const)
  local.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) local.addSubnet(net, bits, "ipv6");
const isLocal = (address: string) => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  return mapped ? local.check(mapped, "ipv4") : local.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
};

// HTTPS only, and no local address unless allowed, checked again on the addresses the name resolves to. A local
// address the person allowed may use plain HTTP.
async function checkUrl(value: string | URL, allowLocal: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(400, "The address must be a URL, such as https://mcp.example.com/mcp");
  }
  if (url.username || url.password) fail(400, "The address must not carry a user name or password.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const named = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".ts.net");
  const addresses = isIP(host) ? [host] : named ? [] : (await lookup(host, { all: true }).catch(() => fail(502, `Cannot find ${host}.`))).map((a) => a.address);
  const near = named || addresses.some(isLocal);
  if (near && !allowLocal) fail(400, `${url.host} is a local address. Allow local addresses for this server to use it.`);
  if (url.protocol !== "https:" && !(near && url.protocol === "http:")) fail(400, "The address must start with https://");
  return url;
}

// fetch that checks every address it reaches, redirects included.
function guarded(base: typeof fetch, allowLocal: boolean): FetchLike {
  return async (input, init) => {
    let [url, request] = [String(input), init];
    for (let hops = 0; ; hops++) {
      await checkUrl(url, allowLocal);
      const res = await base(url, { ...request, redirect: "manual" });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location || hops === 5) return res;
      url = new URL(location, url).href;
      if (res.status !== 307 && res.status !== 308) request = { ...request, method: "GET", body: undefined };
    }
  };
}

function transportFor(url: string, transport: Transport, fetch: FetchLike) {
  return transport === "sse" ? new SSEClientTransport(new URL(url), { fetch }) : new StreamableHTTPClientTransport(new URL(url), { fetch });
}
const newClient = () => new Client({ name: "fxbot", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });

async function listTools(client: Client) {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor && tools.length < 1000);
  return tools;
}

const toolView = (tool: Tool) => ({ name: tool.name, description: tool.description ?? "", readOnly: tool.annotations?.readOnlyHint === true });
const stamp = (tokens: OAuthTokens, refreshToken?: string) => ({
  ...tokens,
  refresh_token: tokens.refresh_token ?? refreshToken,
  expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
});
// A tool name prefix from a server's name or host: "mcp.linear.app" becomes "linear", and an address "local".
function slug(name: string) {
  const host = name.toLowerCase().replace(/:\d+$/, "");
  if (isIP(host.replace(/^\[|\]$/g, "")) || host === "localhost") return "local";
  const labels = host.split(".");
  const word = labels.length > 1 ? (labels.slice(0, -1).find((l) => !["mcp", "api", "www"].includes(l)) ?? labels[0]) : host;
  return word.match(/[a-z0-9]+/g)?.join("_").slice(0, 24) || "mcp";
}
// A plugin's source names a registry entry, for the marks and Update, or else the address it was added by.
const registered = (source: unknown): source is NonNullable<Plugin["source"]> =>
  typeof source === "object" && source !== null && typeof (source as { registry?: unknown }).registry === "string";
const headerName = (name: unknown) => (typeof name === "string" && /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(name) ? name : fail(400, "Each header needs a name of letters, digits, and dashes."));

// Remote MCP servers as plugins: their records, connections, sign-ins, and the tools bots get from them.
export async function createMcp({ store, secretKey, fetch, localUrl, clientMetadataUrl, findEntry, onChange, reserved = () => [] }: McpOptions) {
  const secrets = createSecrets(store.sql, secretKey, "plugin_secrets");
  const records = new Map((await store.plugins.list()).filter((r) => r.kind === "mcp").map((r) => [r.id, r as McpRecord] as [string, McpRecord]));
  const on = new Map<string, Set<string>>();
  for (const { profileId, pluginId } of await store.plugins.on()) on.set(pluginId, (on.get(pluginId) ?? new Set()).add(profileId));
  // The tools bots get: the ones the person picked, or else the read-only ones.
  const allowedOf = (record: McpRecord) => record.allowed ?? record.config.tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name);

  const get = (id: string) => records.get(id) ?? fail(404, "plugin not found");
  async function save(id: string, fields: Partial<Pick<McpRecord, "config" | "enabled" | "bots" | "allowed" | "status" | "source" | "approvedHash">>) {
    const record = records.get(id);
    if (!record) return;
    records.set(id, { ...record, ...fields });
    await store.plugins.update(id, fields);
  }

  // One queue per plugin for its sealed values, so a token renewal and an edit never interleave, and two renewals at
  // once spend one refresh token.
  const locks = new Map<string, Promise<unknown>>();
  function locked<T>(id: string, run: () => Promise<T>): Promise<T> {
    const next = (locks.get(id) ?? Promise.resolve()).then(run, run);
    locks.set(id, next.catch(() => {}));
    return next;
  }
  const read = async (id: string) => (await secrets.get<Secret>(id)) ?? {};
  const edit = (id: string, change: (secret: Secret) => Secret) => locked(id, async () => secrets.put(id, change(await read(id))));

  // A token is renewed when it is within 5 minutes of expiring, or half its life for a short-lived one, and once after
  // a 401. A renewal the authorization server refuses drops the token, so the plugin asks for a new sign-in; one that
  // cannot reach it keeps the token for the next try.
  async function accessToken(id: string) {
    const tokens = (await read(id)).tokens ?? fail(401, "Sign in to this server first.");
    const margin = Math.min(5 * 60 * 1000, (tokens.expires_in ?? Infinity) * 500);
    if (!tokens.refresh_token || !tokens.expiresAt || tokens.expiresAt - margin > Date.now()) return tokens.access_token;
    return renew(id, tokens.access_token);
  }
  function renew(id: string, stale: string) {
    return locked(id, async () => {
      const secret = await read(id);
      if (secret.tokens && secret.tokens.access_token !== stale) return secret.tokens.access_token;
      const { tokens, session } = secret;
      try {
        if (!tokens?.refresh_token || !session) throw new Error("its token cannot be renewed");
        const fresh = await refreshAuthorization(session.authorizationServerUrl, {
          metadata: session.metadata,
          clientInformation: session.client,
          refreshToken: tokens.refresh_token,
          resource: session.resource ? new URL(session.resource) : undefined,
          fetchFn: guarded(fetch, get(id).config.allowLocal),
        });
        await secrets.put(id, { ...secret, tokens: stamp(fresh, tokens.refresh_token) });
        return fresh.access_token;
      } catch (error) {
        const refused = error instanceof OAuthError && ["invalid_grant", "invalid_client", "unauthorized_client"].includes(error.code);
        if (tokens?.refresh_token && session && !refused) return fail(502, `Cannot renew the token: ${(error as Error).message}`);
        await secrets.put(id, { ...secret, tokens: undefined });
        return fail(401, `Sign in again: ${(error as Error).message}`);
      }
    });
  }

  // Requests to a plugin's own server carry its header values and its token. Nothing goes to another origin.
  function authed(record: McpRecord): FetchLike {
    const { id, config } = record;
    const plain = guarded(fetch, config.allowLocal);
    const origin = new URL(config.url).origin;
    return async (url, init) => {
      if (new URL(url).origin !== origin) return plain(url, init);
      const send = async (token?: string) => {
        const headers = new Headers(init?.headers);
        for (const [name, value] of Object.entries((await read(id)).headers ?? {})) headers.set(name, value);
        if (token) headers.set("authorization", `Bearer ${token}`);
        return plain(url, { ...init, headers });
      };
      if (config.auth !== "oauth") return send();
      const token = await accessToken(id);
      const res = await send(token);
      if (res.status !== 401) return res;
      await res.body?.cancel();
      return send(await renew(id, token));
    };
  }

  // What a plugin still needs from the person before it can connect.
  async function waitsFor(record: McpRecord) {
    const secret = await read(record.id).catch(() => ({}) as Secret);
    if (record.config.auth === "oauth" && !secret.tokens) return "Sign in to use it";
    if (record.config.headers.some((name) => !secret.headers?.[name])) return "Add its header values";
    return null;
  }

  // One client per enabled server. A dropped one retries after 1, 2, 4… up to 60 seconds, unless it needs a sign-in
  // or header values first.
  const live = new Map<string, { client?: Client; error?: string; timer?: NodeJS.Timeout; delay: number }>();
  let closed = false;
  const entryOf = (id: string) => live.get(id) ?? live.set(id, { delay: 1000 }).get(id)!;
  async function disconnect(id: string) {
    const entry = entryOf(id);
    clearTimeout(entry.timer);
    const client = entry.client;
    entry.client = undefined;
    await client?.close().catch(() => {});
  }
  async function start(record: McpRecord) {
    await disconnect(record.id);
    const waiting = record.enabled ? await waitsFor(record) : "Turned off";
    entryOf(record.id).error = waiting ?? undefined;
    await save(record.id, { status: waiting ?? "Connecting" });
    if (!waiting) void connect(record.id);
  }
  async function connect(id: string) {
    const record = records.get(id);
    if (!record?.enabled) return;
    const entry = entryOf(id);
    const client = newClient();
    try {
      await client.connect(transportFor(record.config.url, record.config.transport, authed(record)));
      const tools = await listTools(client);
      if (closed || records.get(id)?.enabled !== true || entry.client) return void (await client.close());
      Object.assign(entry, { client, error: undefined, delay: 1000 });
      client.onclose = () => void (entry.client === client && drop(id, "The connection closed."));
      const changed = JSON.stringify(tools) !== JSON.stringify(records.get(id)!.config.tools);
      await save(id, { status: "Connected", ...(changed ? { config: { ...records.get(id)!.config, tools } } : {}) });
      if (changed) onChange();
    } catch (error) {
      await client.close().catch(() => {});
      await drop(id, (error as Error).message);
    }
  }
  async function drop(id: string, reason: string) {
    const record = records.get(id);
    if (!record || closed) return;
    const entry = entryOf(id);
    const client = entry.client;
    entry.client = undefined;
    void client?.close().catch(() => {});
    const waiting = await waitsFor(record);
    entry.error = waiting ?? reason;
    await save(id, { status: waiting ?? `Unreachable: ${reason}` });
    if (waiting || !record.enabled) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void connect(id), entry.delay);
    entry.delay = Math.min(entry.delay * 2, 60_000);
  }

  // A call goes to the server's live client. While it is away, its tools fail with why.
  async function call(record: McpRecord, params: { name: string; arguments?: unknown }, signal?: AbortSignal) {
    const entry = live.get(record.id);
    if (!entry?.client) throw new Error(`${record.name} is unreachable${entry?.error ? `: ${entry.error}` : "."}`);
    try {
      return await entry.client.callTool(params as { name: string; arguments?: Record<string, unknown> }, { signal });
    } catch (error) {
      if (!(error instanceof ProtocolError) && !signal?.aborted) void drop(record.id, (error as Error).message);
      throw error;
    }
  }

  // libfx adapts each server's allowed tools. Each call checks again that the tool is allowed, and that the server is
  // on for the bot, from the session's context.
  async function toolsOf(record: McpRecord): Promise<FxAgentHostTool[]> {
    const { config } = record;
    const allowed = new Set(allowedOf(record));
    const tools = config.tools.filter((t) => allowed.has(t.name));
    const adapter = await createMcpAdapter(
      {
        listTools: async () => ({ tools }),
        callTool: (params, _schema, options) => call(record, params, options?.signal),
        getServerVersion: () => ({ name: record.name }),
      },
      { prefix: `${config.prefix}_`, serverName: record.name },
    );
    return adapter.tools.map((tool, i) => {
      const { name, annotations: hints } = tools[i];
      return {
        ...tool,
        idempotent: hints?.readOnlyHint === true && hints?.idempotentHint === true,
        async execute(input, context) {
          const bot = (context.context as { bot?: string } | undefined)?.bot;
          const now = records.get(record.id);
          if (!now?.enabled) throw new Error(`${record.name} is no longer in Plugins.`);
          if (now.bots === "each" && !(bot && on.get(record.id)?.has(bot))) throw new Error("This tool is off for this bot.");
          if (!allowedOf(now).includes(name)) throw new Error(`${name} is not allowed in Plugins.`);
          return tool.execute(input, context);
        },
      };
    });
  }

  async function view(record: McpRecord): Promise<Plugin> {
    const secret = await read(record.id).catch(() => ({}) as Secret);
    const { url, transport, auth, headers, allowLocal, tools } = record.config;
    return {
      id: record.id,
      kind: "mcp",
      name: record.name,
      url,
      transport,
      auth,
      headers,
      allowLocal,
      enabled: record.enabled,
      bots: record.bots,
      on: [...(on.get(record.id) ?? [])],
      allowed: allowedOf(record),
      status: record.status ?? "",
      tools: tools.map(toolView),
      signedIn: auth === "headers" ? headers.every((name) => secret.headers?.[name]) : Boolean(secret.tokens),
      ownClient: Boolean(secret.own),
      ...(registered(record.source) ? { source: record.source } : {}),
    };
  }

  // What a plugin is, from the address the person typed or the registry entry they picked. The registry's address
  // is configured, not typed, so it is fetched as is.
  async function define(ref: McpRef) {
    if (!ref || typeof ref !== "object") return fail(400, "ref must be an object");
    if ("registry" in ref) {
      if (typeof ref.registry !== "string" || !ref.registry) fail(400, "registry must name a server");
      const version = typeof ref.version === "string" && ref.version ? ref.version : "latest";
      const from: RegistryFrom = ref.from === "fxbot" || ref.from === "official" ? ref.from : "github";
      const entry = (await findEntry(ref.registry, from, version).catch(() => fail(502, `The registry didn't answer for ${ref.registry}.`))) ?? fail(404, `The registry has no ${ref.registry} ${version}.`);
      const { server } = entry;
      const info = infoOf(entry, from);
      const source = { registry: server.name, version: server.version, from };
      const remote = server.remotes?.find((r) => r.type === "streamable-http" || r.type === "sse");
      // An entry that runs only as a package is a process on this machine, which comes with plugins.
      if (!remote) {
        if (!server.packages?.length) fail(400, `${ref.registry} has no remote server to add.`);
        return { name: info.title, url: "", transport: "streamable-http" as Transport, allowLocal: false, headers: [], source, info, local: true };
      }
      return {
        name: info.title,
        url: remote.url,
        transport: remote.type as Transport,
        allowLocal: ref.allowLocal === true,
        headers: (remote.headers ?? []).map((h) => ({ name: headerName(h.name), secret: h.isSecret === true, ...(h.description ? { description: h.description } : {}) })),
        source,
        info,
      };
    }
    if (typeof ref.url !== "string" || !ref.url.trim()) fail(400, "url is required");
    if (ref.transport !== undefined && ref.transport !== "streamable-http" && ref.transport !== "sse") fail(400, "transport must be streamable-http or sse");
    if (ref.headers !== undefined && !Array.isArray(ref.headers)) fail(400, "headers must be a list of names");
    return {
      name: "",
      url: ref.url.trim(),
      transport: ref.transport ?? ("streamable-http" as Transport),
      allowLocal: ref.allowLocal === true,
      headers: (ref.headers ?? []).map((name) => ({ name: headerName(name), secret: true })),
      source: { url: ref.url.trim() },
    };
  }

  // Probes the server without credentials. A 401 means it signs in: with OAuth when it names its authorization
  // server, or else with the headers the person adds.
  async function probe(definition: Awaited<ReturnType<typeof define>>) {
    const { url, transport, allowLocal, headers } = definition;
    const host = (await checkUrl(url, allowLocal)).host;
    const plain = guarded(fetch, allowLocal);
    let challenged = false;
    const watch: FetchLike = async (to, init) => {
      const res = await plain(to, init);
      if (res.status === 401) challenged = true;
      return res;
    };
    const client = newClient();
    try {
      await client.connect(transportFor(url, transport, watch));
      const info = client.getServerVersion();
      return { name: definition.name || info?.title || info?.name || host, auth: (headers.length ? "headers" : "none") as Plugin["auth"], tools: await listTools(client) };
    } catch (error) {
      if (!challenged) return fail(502, `Cannot reach ${host}: ${(error as Error).message}`);
      const found = await discoverOAuthServerInfo(url, { fetchFn: plain }).catch(() => null);
      const name = definition.name || found?.resourceMetadata?.resource_name || host;
      // Some servers take a key as well as OAuth. Headers the person names mean the key.
      return { name, auth: (found?.authorizationServerMetadata && !headers.length ? "oauth" : "headers") as Plugin["auth"], tools: null };
    } finally {
      await client.close().catch(() => {});
    }
  }

  async function preview(ref: McpRef) {
    const definition = await define(ref);
    const info = "info" in definition ? { info: definition.info } : {};
    if ("local" in definition) {
      const page: McpPreview = { hash: "", name: definition.name, url: "", transport: definition.transport, auth: "none", headers: [], allowLocal: false, tools: null, local: true, ...info };
      return { page, definition, found: { name: definition.name, auth: "none" as Plugin["auth"], tools: null } };
    }
    const found = await probe(definition);
    const { url, transport, allowLocal, headers } = definition;
    const hash = createHash("sha256").update(JSON.stringify([url, transport, allowLocal, headers, found.auth])).digest("hex");
    const page: McpPreview = { hash, name: found.name, url, transport, auth: found.auth, headers, allowLocal, tools: found.tools?.map(toolView) ?? null, ...info };
    return { page, definition, found };
  }

  function prefixFor(name: string) {
    const taken = new Set([...records.values()].map((r) => r.config.prefix).concat("chat", "library", ...reserved()));
    const base = slug(name);
    let prefix = base;
    for (let n = 2; taken.has(prefix); n++) prefix = `${base}_${n}`;
    return prefix;
  }

  // Every enabled server's tools, from its last listing.
  async function tools() {
    const lists = await Promise.all([...records.values()].filter((r) => r.enabled).map((r) => toolsOf(r).catch(() => [])));
    return lists.flat();
  }

  const attempts = new Map<string, Attempt>();
  const expired = "This sign-in expired. Start it again from Plugins.";

  // The SDK's OAuth flow, held to one attempt: it registers or picks the client, and gives back the authorization URL
  // instead of opening a browser.
  function provider(attempt: Attempt, own?: StoredOAuthClientInformation): OAuthClientProvider {
    const key = (issuer?: string) => `${issuer} ${attempt.redirectUrl}`;
    return {
      redirectUrl: attempt.redirectUrl,
      clientMetadataUrl: attempt.clientMetadataUrl,
      clientMetadata: {
        client_name: "fxbot",
        redirect_uris: [attempt.redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(attempt.applicationType ? { application_type: attempt.applicationType } : {}),
      } as OAuthClientMetadata,
      state: () => attempt.state,
      clientInformation: async (ctx) => (attempt.client = own ?? (await read(attempt.pluginId)).clients?.[key(ctx?.issuer)]),
      async saveClientInformation(info, ctx) {
        attempt.client = info;
        if (!own) await edit(attempt.pluginId, (s) => ({ ...s, clients: { ...s.clients, [key(ctx?.issuer ?? info.issuer)]: info } }));
      },
      tokens: () => undefined,
      async saveTokens(tokens) {
        const session = { client: attempt.client!, authorizationServerUrl: attempt.discovery!.authorizationServerUrl, metadata: attempt.discovery!.authorizationServerMetadata, resource: attempt.resource };
        await edit(attempt.pluginId, (s) => ({ ...s, tokens: stamp(tokens), session }));
      },
      redirectToAuthorization: (url) => void (attempt.url = url.href),
      saveCodeVerifier: (verifier) => void (attempt.verifier = verifier),
      codeVerifier: () => attempt.verifier ?? fail(400, "This sign-in has no verifier."),
      saveDiscoveryState: (state) => void (attempt.discovery = state),
      discoveryState: () => attempt.discovery,
      saveResourceUrl: (resource) => void (attempt.resource = resource),
    };
  }

  // The first client that can sign in, in this order: the person's own, one registered with the page's own address, the
  // project's metadata document with a loopback redirect, then one registered with a loopback redirect. The page's
  // address is its origin, which the server checked against the address it was reached at; only HTTPS is used, as a
  // tailnet name serves.
  async function signIn(id: string, origin?: unknown): Promise<OAuthAttempt> {
    const record = get(id);
    const callback = typeof origin === "string" && URL.canParse(origin) && new URL(origin).origin === origin && origin.startsWith("https://") ? `${origin}/api/oauth/callback` : undefined;
    if (record.config.auth !== "oauth") fail(400, `${record.name} does not sign in with OAuth.`);
    const fetchFn = guarded(fetch, record.config.allowLocal);
    const info = await discoverOAuthServerInfo(record.config.url, { fetchFn }).catch((error: Error) => fail(502, `Cannot read how ${record.name} signs in: ${error.message}`));
    const metadata = info.authorizationServerMetadata ?? fail(502, `${record.name} names no authorization server.`);
    if (!metadata.code_challenge_methods_supported?.includes("S256")) fail(502, `${record.name}'s sign-in does not offer PKCE with S256, which MCP requires.`);
    const { own } = await read(id);
    const loopback = `${localUrl}/callback`;
    const choice: Pick<Attempt, "redirectUrl" | "clientMetadataUrl" | "applicationType"> = own
      ? { redirectUrl: callback || loopback }
      : callback && metadata.registration_endpoint
        ? { redirectUrl: callback, applicationType: "web" }
        : clientMetadataUrl && metadata.client_id_metadata_document_supported
          ? { redirectUrl: loopback, clientMetadataUrl }
          : metadata.registration_endpoint
            ? { redirectUrl: loopback, applicationType: "native" }
            : fail(400, `${record.name} registers no apps itself. Register an OAuth app with it, with ${callback || loopback} as its redirect URI, and enter its client id.`);
    for (const [key, other] of attempts) {
      if (other.pluginId === id && other.status.status === "waiting") other.status = { status: "failed", error: "A newer sign-in replaced this one." };
      if (other.expiresAt < Date.now() - 60 * 60 * 1000) attempts.delete(key);
    }
    const attempt: Attempt = {
      id: newId(),
      url: "",
      mode: choice.redirectUrl === callback ? "redirect" : "paste",
      expiresAt: Date.now() + 10 * 60 * 1000,
      pluginId: id,
      state: randomBytes(24).toString("base64url"),
      ...choice,
      discovery: { authorizationServerUrl: info.authorizationServerUrl, resourceMetadata: info.resourceMetadata, authorizationServerMetadata: metadata },
      status: { status: "waiting" },
      used: false,
    };
    await auth(provider(attempt, own), { serverUrl: record.config.url, fetchFn }).catch((error: Error) => fail(502, `Cannot start signing in to ${record.name}: ${error.message}`));
    attempts.set(attempt.id, attempt);
    return { id: attempt.id, url: attempt.url, mode: attempt.mode, expiresAt: attempt.expiresAt };
  }

  // The redirect back carries `state`, which must name a waiting, unexpired attempt; the SDK then checks `iss` and
  // trades the code for tokens with the attempt's verifier.
  function pendingFor(state: string | null) {
    const attempt = [...attempts.values()].find((a) => a.state === state);
    if (!state || !attempt) return fail(400, "This sign-in is unknown or already used. Start it again from Plugins.");
    if (attempt.expiresAt < Date.now()) {
      if (attempt.status.status === "waiting") attempt.status = { status: "failed", error: expired };
      fail(400, expired);
    }
    if (attempt.used || attempt.status.status !== "waiting") fail(400, "This sign-in is unknown or already used. Start it again from Plugins.");
    return attempt;
  }
  async function finish(attempt: Attempt, query: URLSearchParams) {
    attempt.used = true;
    try {
      const record = records.get(attempt.pluginId) ?? fail(404, "This server is no longer in Plugins.");
      if (query.get("error")) throw new Error(query.get("error_description") || query.get("error")!);
      const code = query.get("code") || fail(400, "The address has no code.");
      const { own } = await read(attempt.pluginId);
      await auth(provider(attempt, own), { serverUrl: record.config.url, authorizationCode: code, iss: query.get("iss") ?? undefined, fetchFn: guarded(fetch, record.config.allowLocal) });
      attempt.status = { status: "done" };
      await start(records.get(attempt.pluginId)!);
    } catch (error) {
      attempt.status = { status: "failed", error: (error as Error).message };
    }
    return attempt.status;
  }

  return {
    tools,
    // The prefixes servers' tools take, which a plugin's name must not.
    prefixes: () => [...records.values()].map((r) => r.config.prefix),
    // Connects every enabled server, in the background.
    connect: () => void Promise.all([...records.values()].map(start)),

    list: async () => Promise.all([...records.values()].map(view)),
    preview: async (ref: McpRef) => (await preview(ref)).page,
    // Adds what the page showed, if the server still matches its hash.
    async add(ref: McpRef, hash: unknown) {
      const { page, definition, found } = await preview(ref);
      if (page.local) fail(400, `${page.name} runs on this machine, which comes with plugins.`);
      if (hash !== page.hash) fail(409, "This server changed since its page was shown. Look at it again before adding it.");
      const record: McpRecord = {
        id: newId(),
        kind: "mcp",
        name: page.name,
        source: definition.source,
        config: { url: page.url, transport: page.transport, headers: page.headers.map((h) => h.name), auth: found.auth, allowLocal: page.allowLocal, prefix: prefixFor(page.name), tools: found.tools ?? [] },
        approvedHash: page.hash,
        enabled: true,
        bots: "all",
        allowed: null,
        status: null,
      };
      await store.plugins.create(record);
      records.set(record.id, record);
      await start(record);
      if (record.config.tools.length) onChange();
      return view(records.get(record.id)!);
    },
    // Turns a server on or off, gives it to every bot or to chosen ones, or sets which of its tools bots get.
    async change(id: string, input: { enabled?: unknown; bots?: unknown; allowed?: unknown }) {
      const record = get(id);
      const { enabled, bots, allowed } = input ?? {};
      if (enabled !== undefined && typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      if (bots !== undefined && bots !== "all" && bots !== "each") fail(400, "bots must be all or each");
      if (allowed !== undefined && (!Array.isArray(allowed) || allowed.some((name) => typeof name !== "string"))) fail(400, "allowed must be a list of tool names");
      const switched = enabled !== undefined && enabled !== record.enabled;
      await save(id, {
        ...(enabled === undefined ? {} : { enabled: enabled as boolean }),
        ...(bots === undefined ? {} : { bots: bots as McpRecord["bots"] }),
        ...(allowed === undefined ? {} : { allowed: [...new Set(allowed as string[])] }),
      });
      if (switched) await start(records.get(id)!);
      if (switched || allowed !== undefined) onChange();
      return view(records.get(id)!);
    },
    // Moves a plugin from a registry to the definition its newer page showed, once the owner adds it again. Its
    // values stay; a header it didn't have before waits for its value.
    async update(id: string, hash: unknown) {
      const record = get(id);
      const source = registered(record.source) ? record.source : fail(400, `${record.name} isn't from a registry.`);
      const { page, definition, found } = await preview({ registry: source.registry, allowLocal: record.config.allowLocal, from: source.from });
      if (page.local) fail(400, `${page.name} now runs only on this machine, which comes with plugins.`);
      if (hash !== page.hash) fail(409, "This server changed since its page was shown. Look at it again before updating.");
      const config = { ...record.config, url: page.url, transport: page.transport, headers: page.headers.map((h) => h.name), auth: found.auth, tools: found.tools ?? record.config.tools };
      await save(id, { config, source: definition.source, approvedHash: page.hash });
      await start(records.get(id)!);
      onChange();
      return view(records.get(id)!);
    },
    async remove(id: string) {
      get(id);
      await disconnect(id);
      live.delete(id);
      records.delete(id);
      on.delete(id);
      await store.plugins.remove(id);
      secrets.forget(id);
      onChange();
    },
    // Write-only. Header values must be for the headers the plugin was approved with.
    async setSecrets(id: string, input: PluginSecrets) {
      const record = get(id);
      const { headers, clientId, clientSecret } = input ?? {};
      if (headers !== undefined) {
        if (!headers || typeof headers !== "object") fail(400, "headers must map names to values");
        for (const [name, value] of Object.entries(headers)) {
          if (!record.config.headers.includes(name)) fail(400, `${record.name} has no header ${name}.`);
          if (typeof value !== "string" || !value || value.length > 8192 || /[\r\n]/.test(value)) fail(400, `${name} needs a value of one line, up to 8 KiB.`);
        }
      }
      if (clientId !== undefined && (typeof clientId !== "string" || clientId.length > 500)) fail(400, "clientId must be a string");
      if (clientSecret !== undefined && (typeof clientSecret !== "string" || clientSecret.length > 2000)) fail(400, "clientSecret must be a string");
      const own = clientId?.trim() ? { client_id: clientId.trim(), ...(clientSecret?.trim() ? { client_secret: clientSecret.trim() } : {}) } : undefined;
      await edit(id, (s) => ({ ...s, ...(headers ? { headers: { ...s.headers, ...headers } } : {}), ...(clientId === undefined ? {} : { own }) }));
      if (headers) await start(record);
      return view(records.get(id)!);
    },
    async forBot(profileId: string, pluginId: string, enabled: unknown) {
      const record = get(pluginId);
      if (typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      await store.plugins.forBot(profileId, pluginId, enabled as boolean);
      const bots = on.get(pluginId) ?? new Set<string>();
      if (enabled) bots.add(profileId);
      else bots.delete(profileId);
      on.set(pluginId, bots);
      return view(record);
    },

    oauth: {
      start: signIn,
      get(id: string): OAuthStatus {
        const attempt = attempts.get(id) ?? fail(404, "sign-in not found");
        if (attempt.status.status === "waiting" && attempt.expiresAt < Date.now()) attempt.status = { status: "failed", error: expired };
        return attempt.status;
      },
      // The address of the page a loopback redirect could not load, as a phone shows it.
      async paste(id: string, address: unknown) {
        attempts.get(id) ?? fail(404, "sign-in not found");
        let url: URL;
        try {
          url = new URL(String(address).trim());
        } catch {
          return fail(400, "Paste the whole address, starting with http.");
        }
        const attempt = pendingFor(url.searchParams.get("state"));
        if (attempt.id !== id) fail(400, "That address belongs to another sign-in.");
        return finish(attempt, url.searchParams);
      },
      callback: async (query: URLSearchParams) => finish(pendingFor(query.get("state")), query),
    },

    // A connection still opening closes itself when it gets there.
    async close() {
      closed = true;
      await Promise.all([...live.keys()].map(disconnect));
    },
  };
}
