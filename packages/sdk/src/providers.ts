import { createFxAgent, type FxAgent, type FxAgentTool, type FxCustomProviderModel, type FxProviderCredentials } from "libfx";
import * as chatgpt from "libfx/chatgpt";
import { local } from "libfx/durable-local";
import * as grok from "libfx/grok";
import { join } from "node:path";
import { createModels, type Access } from "./models.ts";
import { createSecrets, withoutSecrets } from "./secrets.ts";
import { newId, type ProviderRecord, type Sql, type Store } from "./store.ts";
import { kinds, type Kind, type NewProvider, type Provider, type ProviderUpdate, type SignIn, type SignInStatus } from "./types.ts";
import * as vercel from "./vercel.ts";

type Fetch = typeof fetch;
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const plans = { chatgpt, grok };
const refreshSkewMs = 5 * 60 * 1000;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

// libfx's rule for a custom provider's address. libfx checks it only when a turn starts, so it is checked here first.
export function checkBaseUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    return fail(400, "baseUrl must be a URL");
  }
  if (url.username || url.password || url.search || url.hash) fail(400, "baseUrl must not carry credentials, a query, or a fragment");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback.has(url.hostname))) fail(400, "baseUrl must use https, or http on localhost");
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

// OpenCode's requests: the session id moves from the key libfx sent into `x-opencode-session`, and fxbot names itself,
// as OpenCode asks of clients. libfx would mask only the combined key, so the plain key is masked in error bodies here.
function opencodeFetch(fetch: Fetch): Fetch {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    const [, key, session] = /^Bearer (\S+) session=(\S+)$/.exec(headers.get("authorization") ?? "") ?? [];
    if (key) {
      headers.set("authorization", `Bearer ${key}`);
      headers.set("x-opencode-session", session);
    }
    headers.set("user-agent", "fxbot");
    return withoutSecrets(await fetch(input, { ...init, headers }), [key]);
  };
}

const text = (value: unknown, name: string, max = 200) => {
  if (typeof value !== "string") return fail(400, `${name} must be a string`);
  if (value.trim().length > max) fail(400, `${name} is over ${max} characters`);
  return value.trim();
};
const contextField = (value: unknown) =>
  value === null || (Number.isInteger(value) && (value as number) > 0 && (value as number) <= 100_000_000) ? (value as number | null) : fail(400, "contextWindow must be a whole number of tokens, or null");

export type ProvidersOptions = {
  store: Store;
  secretKey: Buffer;
  dataDir: string;
  vercelClientId?: string;
  fetch: Fetch;
  tools: FxAgentTool[];
};

// Every provider runs as its own libfx agent, because libfx gives an agent one provider and a session runs only on
// the agent that started it. Keys and tokens live sealed in Postgres and reach libfx only through its callbacks.
export async function createProviders({ store, secretKey, dataDir, vercelClientId, fetch, tools }: ProvidersOptions) {
  const secrets = createSecrets(store.sql, secretKey);
  const models = createModels(store.sql, fetch);
  const agents = new Map<string, { agent: FxAgent; models: Record<string, FxCustomProviderModel> | null }>();
  // Why a provider has no agent, such as a secret that will not open. The server keeps running.
  const errors = new Map<string, string>();

  // One queue per provider, so its tokens are renewed once at a time: by libfx for turns and by the SDK for its own calls.
  const locks = new Map<string, Promise<unknown>>();
  function locked<T>(id: string, run: () => Promise<T>): Promise<T> {
    const next = (locks.get(id) ?? Promise.resolve()).then(run, run);
    locks.set(id, next.catch(() => {}));
    return next;
  }

  // Renews tokens that expire within 5 minutes, unless another caller already did while this one waited.
  async function renewed<T extends { accessToken: string; refreshToken?: string; expiresAt?: number }>(id: string, renew: (old: T) => Promise<T>) {
    const current = (await secrets.get<T>(id)) ?? fail(400, "Sign in to this provider first.");
    if (!current.refreshToken || !current.expiresAt || current.expiresAt - refreshSkewMs > Date.now()) return current;
    return locked(id, async () => {
      const latest = (await secrets.get<T>(id))!;
      if (latest.accessToken !== current.accessToken) return latest;
      const next = await renew(latest);
      await secrets.put(id, next);
      return next;
    });
  }

  const vercelFetch = (record: ProviderRecord) =>
    vercel.vercelFetch(async () => ({ credentials: await renewed<vercel.VercelCredentials>(record.id, (old) => vercel.refresh(old, vercelClientId!, fetch)), teamId: record.teamId }), fetch);
  const keyOf = async (record: ProviderRecord) => (await secrets.get<{ apiKey?: string }>(record.id))?.apiKey;

  // What the SDK's own requests to a provider need, outside a turn.
  async function access(record: ProviderRecord): Promise<Access> {
    if (record.kind === "chatgpt" || record.kind === "grok")
      return renewed<FxProviderCredentials>(record.id, (old) => plans[record.kind as "chatgpt"].refreshCredentials(old, { fetch }));
    if (record.kind === "vercel") return { fetch: vercelFetch(record) };
    return { apiKey: await keyOf(record) };
  }

  // The libfx options that point an agent, or a throwaway engine, at a provider.
  async function options(record: ProviderRecord): Promise<Record<string, unknown>> {
    if (record.kind === "chatgpt" || record.kind === "grok")
      return {
        provider: record.kind === "chatgpt" ? "codex" : "grok",
        credentials: async () => (await secrets.get<FxProviderCredentials>(record.id)) ?? fail(400, "Sign in to this provider again."),
        onCredentials: (next: FxProviderCredentials) => secrets.put(record.id, next),
        refreshLock: (_: unknown, refresh: () => Promise<void>) => locked(record.id, refresh),
      };
    if (record.kind === "vercel") return { apiKey: "vercel-login", fetch: vercelFetch(record) };
    const apiKey = await keyOf(record);
    if (record.kind === "gateway") return { apiKey: apiKey ?? fail(400, "This provider has no key.") };
    const provider = { name: `p-${record.id}`, baseUrl: record.baseUrl!, models: {} };
    if (record.kind !== "opencode" && record.kind !== "opencode-go") return { provider, ...(apiKey ? { credentials: async () => ({ apiKey }) } : {}) };
    // OpenCode routes each conversation by its `x-opencode-session` header, which Go requires. Only credentials() learns
    // a request's session, so the key handed to libfx carries it, and opencodeFetch moves it into the header.
    return {
      provider,
      credentials: async ({ sessionId }: { sessionId?: string }) => ({ apiKey: sessionId ? `${apiKey} session=${sessionId}` : apiKey }),
      fetch: opencodeFetch(fetch),
    };
  }

  async function start(record: ProviderRecord) {
    errors.delete(record.id);
    try {
      const provider = await options(record);
      const agent = createFxAgent({
        // Sessions run only on an agent with the name that started them. Never rename one.
        name: `p-${record.id}`,
        // A durable session's checkpoint opens with the agent's own options, and a custom provider needs a model
        // there. Sessions always pass their own, so this one never reaches a request.
        model: "fxbot-unset",
        durability: local({ dir: join(dataDir, "sessions") }),
        tools,
        ...provider,
      } as Parameters<typeof createFxAgent>[0]);
      agents.set(record.id, { agent, models: (provider.provider as { models?: Record<string, FxCustomProviderModel> })?.models ?? null });
    } catch (error) {
      errors.set(record.id, (error as Error).message);
    }
  }

  async function stop(id: string) {
    const entry = agents.get(id);
    agents.delete(id);
    await entry?.agent.close();
  }

  // Closing an agent waits for its running turns. A turn asking for it meanwhile waits for the new one.
  const restarts = new Map<string, Promise<void>>();
  function restart(record: ProviderRecord) {
    const next = (restarts.get(record.id) ?? Promise.resolve()).then(async () => (await stop(record.id), await start(record)));
    restarts.set(record.id, next.catch(() => {}));
    return next;
  }

  async function record(id: unknown) {
    if (typeof id !== "string" || !id) return fail(400, "provider is required");
    return (await store.providers.get(id)) ?? fail(404, "provider not found");
  }

  for (const each of await store.providers.list()) await start(each);

  async function list(): Promise<Provider[]> {
    const held = await secrets.has();
    return (await store.providers.list()).map((r) => {
      const device = kinds[r.kind as Kind]?.connect === "device";
      return {
        ...r,
        kind: r.kind as Kind,
        hasKey: !device && held.has(r.id),
        signedIn: device && held.has(r.id),
        error: errors.get(r.id) ?? null,
      };
    });
  }
  const listed = async (id: string) => (await list()).find((p) => p.id === id)!;

  // One device code sign-in at a time. Its object stays here: what it holds can claim the tokens.
  let attempt: { id: string; status: SignInStatus; abort: AbortController } | undefined;

  async function signedIn(kind: Kind, provider: string | undefined, credentials: object) {
    if (provider) {
      const existing = await record(provider);
      await secrets.put(provider, credentials);
      models.forget(provider);
      await restart(existing);
      return provider;
    }
    const fresh: ProviderRecord = { id: newId(), kind, name: kinds[kind].label, baseUrl: null, model: "", contextWindow: null, teamId: null };
    // An account with one team needs no choice.
    if (kind === "vercel") {
      const teams = await vercel.teams((credentials as vercel.VercelCredentials).accessToken, fetch);
      if (teams.length === 1) fresh.teamId = teams[0].id;
    }
    await store.sql.begin(async (tx) => {
      await store.providers.save(fresh, tx as unknown as Sql);
      await secrets.put(fresh.id, credentials, tx as unknown as Sql);
    });
    await start(fresh);
    return fresh.id;
  }

  return {
    options,
    // The agent for a bot's provider, with the model metadata libfx reads when a turn opens its engine (libfx 0.0.16,
    // checked by hand). Vision stays on when unknown, so images are still tried.
    async agentFor(id: string, model: string) {
      await restarts.get(id);
      const entry = agents.get(id) ?? fail(400, errors.get(id) ?? "This bot's provider is gone. Pick another in its settings.");
      if (entry.models && model && !entry.models[model]) {
        const current = await record(id);
        const known = await access(current).then((a) => models.list(current, a)).then((list) => list.find((m) => m.id === model), () => undefined);
        const meta: FxCustomProviderModel = { supportsVision: known?.supportsVision ?? true };
        const contextWindow = current.contextWindow ?? known?.contextWindow;
        if (contextWindow) meta.contextWindow = contextWindow;
        if (known?.maxOutputTokens && (!contextWindow || known.maxOutputTokens < contextWindow)) meta.maxOutputTokens = known.maxOutputTokens;
        if (known?.supportsToolUse !== undefined) meta.supportsToolUse = known.supportsToolUse;
        entry.models[model] = meta;
      }
      return entry.agent;
    },
    has: (id: string) => agents.has(id),
    get: record,
    list,
    // libfx fixes an agent's tools when it is made, so a new tool list, as when an add-on comes or goes, makes every
    // agent again.
    async retool(next: FxAgentTool[]) {
      tools = next;
      await Promise.all((await store.providers.list()).map(restart));
    },

    // Key and server kinds. Plans and accounts are added by signing in.
    async add(input: NewProvider) {
      const kind = input?.kind;
      const preset = kinds[kind as Kind] ?? fail(400, `kind must be one of ${Object.keys(kinds).join(", ")}`);
      if (preset.connect === "device") fail(400, `${preset.label} is added by signing in`);
      const fixed = "baseUrl" in preset && preset.connect === "key" ? preset.baseUrl : undefined;
      const baseUrl = kind === "gateway" ? null : checkBaseUrl(fixed ?? input.baseUrl ?? ("baseUrl" in preset ? preset.baseUrl : undefined));
      const apiKey = preset.connect === "url" && kind !== "custom" ? "" : text(input.apiKey ?? "", "apiKey", 4096);
      if (preset.connect === "key" && !apiKey) fail(400, "apiKey is required");
      const fresh: ProviderRecord = {
        id: newId(),
        kind,
        name: text(input.name ?? "", "name") || preset.label,
        baseUrl,
        model: text(input.model ?? "", "model"),
        contextWindow: preset.connect === "url" ? contextField(input.contextWindow ?? null) : null,
        teamId: null,
      };
      await models.check(fresh, { apiKey });
      await store.sql.begin(async (tx) => {
        await store.providers.save(fresh, tx as unknown as Sql);
        if (apiKey) await secrets.put(fresh.id, { apiKey }, tx as unknown as Sql);
      });
      await start(fresh);
      return listed(fresh.id);
    },

    async update(id: string, input: ProviderUpdate) {
      const current = await record(id);
      const preset = kinds[current.kind as Kind];
      if (!input || typeof input !== "object") fail(400, "body must be a JSON object");
      if (input.apiKey !== undefined && preset.connect === "device") fail(400, "Sign in again to replace this provider's tokens.");
      if (input.baseUrl !== undefined && preset.connect !== "url") fail(400, "This provider's address is fixed.");
      const next: ProviderRecord = {
        ...current,
        ...(input.name === undefined ? {} : { name: text(input.name, "name") || preset.label }),
        ...(input.model === undefined ? {} : { model: text(input.model, "model") }),
        ...(input.baseUrl === undefined ? {} : { baseUrl: checkBaseUrl(input.baseUrl) }),
        ...(input.contextWindow === undefined || preset.connect !== "url" ? {} : { contextWindow: contextField(input.contextWindow) }),
        ...(input.teamId === undefined || current.kind !== "vercel" ? {} : { teamId: text(input.teamId, "teamId") }),
      };
      const apiKey = input.apiKey === undefined ? undefined : text(input.apiKey, "apiKey", 4096);
      if (apiKey === "" && preset.connect === "key") fail(400, "apiKey is required");
      if (apiKey !== undefined || next.baseUrl !== current.baseUrl) await models.check(next, { apiKey: apiKey ?? (await keyOf(current)) });
      await store.sql.begin(async (tx) => {
        await store.providers.save(next, tx as unknown as Sql);
        if (apiKey) await secrets.put(id, { apiKey }, tx as unknown as Sql);
      });
      models.forget(id);
      if (apiKey !== undefined || next.baseUrl !== current.baseUrl || next.teamId !== current.teamId || next.contextWindow !== current.contextWindow) await restart(next);
      return listed(id);
    },

    async remove(id: string) {
      await record(id);
      const bots = await store.profiles.usingProvider(id);
      if (bots) fail(400, `${bots} bot${bots === 1 ? " uses" : "s use"} this provider. Move ${bots === 1 ? "it" : "them"} to another first.`);
      await stop(id);
      await store.providers.remove(id);
      secrets.forget(id);
      models.forget(id);
      if ((await store.settings.get()).defaultProvider === id) await store.settings.save({ defaultProvider: "" });
    },

    async models(id: string) {
      const current = await record(id);
      return models.list(current, await access(current));
    },

    async teams(id: string) {
      const current = await record(id);
      if (current.kind !== "vercel") fail(400, "Only a Vercel account has teams.");
      const { accessToken } = await renewed<vercel.VercelCredentials>(id, (old) => vercel.refresh(old, vercelClientId!, fetch));
      return vercel.teams(accessToken, fetch);
    },

    signIns: {
      async start({ kind, provider }: { kind: Kind; provider?: string }): Promise<SignIn> {
        if (kinds[kind]?.connect !== "device") fail(400, "kind must be chatgpt, grok, or vercel");
        if (kind === "vercel" && !vercelClientId) fail(400, "Set FXBOT_VERCEL_CLIENT_ID to sign in with a Vercel account.");
        if (provider !== undefined && (await record(provider)).kind !== kind) fail(400, `provider ${provider} is not a ${kinds[kind].label}`);
        if (attempt?.status.status === "waiting") {
          attempt.abort.abort();
          attempt.status = { status: "failed", error: "A newer sign-in replaced this one." };
        }
        let device;
        try {
          device = kind === "vercel" ? await vercel.startDeviceSignIn(vercelClientId!, fetch) : await plans[kind as "chatgpt"].startDeviceSignIn({ fetch });
        } catch (error) {
          return fail(502, (error as Error).message);
        }
        const current = { id: newId(), status: { status: "waiting" } as SignInStatus, abort: new AbortController() };
        attempt = current;
        const signal = current.abort.signal;
        const waiting = kind === "vercel" ? vercel.completeDeviceSignIn(device as vercel.VercelDevice, vercelClientId!, fetch, signal) : plans[kind as "chatgpt"].completeDeviceSignIn(device as chatgpt.ChatgptDeviceSignIn, { fetch, signal });
        waiting
          .then((credentials) => signedIn(kind, provider, credentials))
          .then(
            (id) => !signal.aborted && (current.status = { status: "done", provider: id }),
            (error: Error) => !signal.aborted && (current.status = { status: "failed", error: error.message }),
          );
        return { id: current.id, verificationUrl: device.verificationUrl, userCode: device.userCode, expiresAt: device.expiresAt };
      },
      get: (id: string) => (attempt?.id === id ? attempt.status : fail(404, "sign-in not found")),
      cancel(id: string) {
        if (attempt?.id !== id) return fail(404, "sign-in not found");
        if (attempt.status.status === "waiting") {
          attempt.abort.abort();
          attempt.status = { status: "failed", error: "Cancelled." };
        }
      },
    },

    close: async () => Promise.all([...agents.keys()].map(stop)),
  };
}

export type Providers = Awaited<ReturnType<typeof createProviders>>;
