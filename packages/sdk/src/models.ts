import { listModels } from "libfx";
import type postgres from "postgres";
import type { ProviderRecord, Sql } from "./store.ts";
import type { Model } from "./types.ts";

type Fetch = typeof fetch;
const day = 24 * 60 * 60 * 1000;
const cacheMs = 5 * 60 * 1000;

// The models.dev entries behind the hosted key kinds.
const catalogOf: Record<string, string> = { openai: "openai", opencode: "opencode", "opencode-go": "opencode-go", openrouter: "openrouter" };
// OpenCode's chat paths serve no model list; these lists beside them answer a bad key with a 401 (checked).
const keyCheckAt: Record<string, string> = { opencode: "https://opencode.ai/inference/v1/models", "opencode-go": "https://opencode.ai/inference/go/v1/models" };

// A failed list says which source failed and its status, so a bad key never looks like an empty list. `upstream`
// is the source's own status, for the key check.
const failed = (what: string, upstream?: number) =>
  Object.assign(new Error(`${what} failed${upstream ? ` (HTTP ${upstream})` : ""}.`), { status: 502, upstream });

async function getJson(fetch: Fetch, url: string, init: RequestInit, what: string) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw failed(`Reaching ${what}`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw failed(what, response.status);
  }
  return response.json();
}

const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

// Chat models only: models.dev also lists embedding and image models, and models some hosts serve only over
// Anthropic's or Google's API, which libfx's custom providers do not speak.
const isChat = (m: any) =>
  m.status !== "deprecated" &&
  (m.modalities?.output ?? ["text"]).includes("text") &&
  !String(m.family ?? "").includes("embedding") &&
  [undefined, "@ai-sdk/openai", "@ai-sdk/openai-compatible"].includes(m.provider?.npm);
const fromModelsDev = (m: any): Model => ({
  id: m.id,
  name: m.name,
  contextWindow: m.limit?.context,
  maxOutputTokens: m.limit?.output,
  supportsToolUse: m.tool_call,
  supportsVision: m.modalities?.input?.includes("image"),
});

// What a provider needs to be asked for its models: its key, a plan's tokens, or a fetch that adds a Vercel login.
export type Access = { apiKey?: string; accessToken?: string; accountId?: string; fetch?: Fetch };

type Kept = { at: number; models: Model[] };

// One source per kind of provider. Each list is kept in memory and in Postgres, so a restart still has it; one older
// than 5 minutes is fetched again behind the answer.
export function createModels(sql: Sql, fetch: Fetch) {
  const cache = new Map<string, Kept>();
  const pending = new Map<string, Promise<Kept>>();
  // A list fetched for an old key or address is dropped rather than kept.
  const generation = new Map<string, number>();
  let codex: { at: number; version: string } | undefined;

  // Codex may hide newer models from an older client, so fx asks with the current Codex CLI version.
  async function codexVersion() {
    if (!codex || Date.now() - codex.at > day)
      codex = { at: Date.now(), version: (await getJson(fetch, "https://registry.npmjs.org/@openai/codex/latest", {}, "The Codex version lookup")).version };
    return codex.version;
  }

  // models.dev, at most once a day with its ETag, trimmed to the hosted kinds. A stale copy beats none.
  async function catalog(): Promise<Record<string, any>> {
    const row = (await sql`select etag, data, fetched_at from models_dev`)[0];
    if (row?.data && Date.now() - row.fetchedAt < day) return row.data;
    try {
      const response = await fetch("https://models.dev/api.json", { headers: row?.etag ? { "if-none-match": row.etag } : {} });
      if (response.status === 304 && row?.data) {
        await sql`update models_dev set fetched_at = now()`;
        return row.data;
      }
      if (!response.ok) throw failed("models.dev", response.status);
      const all = await response.json();
      const data = Object.fromEntries(Object.values(catalogOf).map((id) => [id, all[id] ?? null]));
      await sql`insert into models_dev values (1, ${response.headers.get("etag")}, ${sql.json(data)}, now())
        on conflict (id) do update set etag = excluded.etag, data = excluded.data, fetched_at = excluded.fetched_at`;
      return data;
    } catch (error) {
      if (row?.data) return row.data;
      throw error instanceof Error && "upstream" in error ? error : failed("Reaching models.dev");
    }
  }

  async function fetchList(record: ProviderRecord, access: Access): Promise<Model[]> {
    const origin = record.baseUrl ? new URL(record.baseUrl).origin : "";
    switch (record.kind) {
      case "chatgpt": {
        const url = `https://chatgpt.com/backend-api/codex/models?client_version=${await codexVersion()}`;
        const body = await getJson(fetch, url, { headers: { ...bearer(access.accessToken), "chatgpt-account-id": access.accountId! } }, "The ChatGPT model list");
        return body.models
          .filter((m: any) => m.visibility === "list" && m.supported_in_api)
          .map((m: any) => ({ id: m.slug, name: m.display_name, contextWindow: m.context_window, supportsVision: m.input_modalities?.includes("image") }));
      }
      case "grok": {
        const body = await getJson(fetch, "https://cli-chat-proxy.grok.com/v1/models", { headers: { ...bearer(access.accessToken), "x-userid": access.accountId! } }, "The Grok model list");
        return body.data
          .filter((m: any) => m.api_backend === "responses")
          .map((m: any) => ({ id: m.model ?? m.id, contextWindow: m.context_window, maxOutputTokens: m.max_completion_tokens }));
      }
      case "gateway":
      case "vercel":
        try {
          return (await listModels({ apiKey: access.apiKey ?? "vercel", fetch: access.fetch ?? fetch })).map((id) => ({ id }));
        } catch (error) {
          // libfx names only the HTTP status; anything else, such as a Vercel account with no team yet, keeps its own words.
          const upstream = Number(/HTTP (\d+)/.exec((error as Error).message)?.[1]);
          throw upstream ? failed("The AI Gateway model list", upstream) : Object.assign(error as Error, { status: 502 });
        }
      case "ollama": {
        const tags = await getJson(fetch, `${origin}/api/tags`, {}, "Ollama's model list");
        const shown = await Promise.all(
          tags.models.map(async (m: any) => ({
            id: m.name as string,
            show: await getJson(fetch, `${origin}/api/show`, { method: "POST", body: JSON.stringify({ model: m.name }) }, `Ollama's details for ${m.name}`),
          })),
        );
        return shown
          .filter(({ show }) => show.capabilities?.includes("completion"))
          .map(({ id, show }) => ({
            id,
            supportsToolUse: show.capabilities.includes("tools"),
            supportsVision: show.capabilities.includes("vision"),
            contextWindow: Object.entries(show.model_info ?? {}).find(([key, value]) => key.endsWith(".context_length") && typeof value === "number")?.[1] as number | undefined,
          }));
      }
      case "lmstudio": {
        const body = await getJson(fetch, `${origin}/api/v1/models`, {}, "LM Studio's model list");
        return body.models
          .filter((m: any) => m.type === "llm")
          .map((m: any) => ({
            id: m.key,
            name: m.display_name,
            supportsToolUse: m.capabilities?.trained_for_tool_use,
            supportsVision: m.capabilities?.vision,
            contextWindow: m.loaded_instances?.length ? Math.min(...m.loaded_instances.map((i: any) => i.config.context_length)) : m.max_context_length,
          }));
      }
      default: {
        const hosted = catalogOf[record.kind];
        if (hosted) return Object.values((await catalog())[hosted]?.models ?? {}).filter(isChat).map(fromModelsDev);
        const body = await getJson(fetch, `${record.baseUrl}/models`, { headers: bearer(access.apiKey) }, "The model list");
        return body.data.map((m: any) => ({ id: m.id }));
      }
    }
  }

  async function kept(id: string): Promise<Kept | undefined> {
    const hit = cache.get(id);
    if (hit) return hit;
    const row = (await sql<{ models: Model[]; fetchedAt: Date }[]>`select models, fetched_at from model_lists where provider_id = ${id}`)[0];
    if (!row) return undefined;
    const found = { at: new Date(row.fetchedAt).getTime(), models: row.models };
    cache.set(id, found);
    return found;
  }

  // Fetches a provider's list and keeps it. Asks while one runs share it.
  function refresh(record: ProviderRecord, access: Access) {
    const running = pending.get(record.id);
    if (running) return running;
    const started = generation.get(record.id) ?? 0;
    const next = (async () => {
      const models = (await fetchList(record, access)).sort((a, b) => a.id.localeCompare(b.id));
      const found = { at: Date.now(), models };
      if ((generation.get(record.id) ?? 0) !== started) return found;
      cache.set(record.id, found);
      await sql`insert into model_lists (provider_id, models, fetched_at) values (${record.id}, ${sql.json(models as unknown as postgres.JSONValue)}, now())
        on conflict (provider_id) do update set models = excluded.models, fetched_at = excluded.fetched_at`;
      return found;
    })().finally(() => pending.delete(record.id));
    pending.set(record.id, next);
    return next;
  }

  return {
    // What the provider listed last answers at once, and a list older than 5 minutes is fetched again behind it, for
    // the next look. A failed refresh keeps the old list. Only a provider never listed waits for its first fetch.
    // The provider's own context field wins over what its server reports.
    async list(record: ProviderRecord, access: Access) {
      let found = await kept(record.id);
      if (!found) found = await refresh(record, access);
      else if (Date.now() - found.at > cacheMs) refresh(record, access).catch(() => {});
      const window = record.contextWindow;
      return window ? found.models.map((m) => ({ ...m, contextWindow: window })) : found.models;
    },
    // A new key, address, team, or sign-in may list other models.
    async forget(id: string) {
      generation.set(id, (generation.get(id) ?? 0) + 1);
      cache.delete(id);
      await sql`delete from model_lists where provider_id = ${id}`;
    },
    // A key is checked by listing with it: Gateway and local servers by their own list, OpenCode at its own, and
    // others at `/models`, where a 404 passes, since some servers serve no list there.
    async check(record: ProviderRecord, access: Access) {
      try {
        if (["gateway", "ollama", "lmstudio"].includes(record.kind)) await fetchList(record, access);
        else await getJson(fetch, keyCheckAt[record.kind] ?? `${record.baseUrl}/models`, { headers: bearer(access.apiKey) }, "The key check");
      } catch (error) {
        const upstream = (error as { upstream?: number }).upstream;
        if (upstream === 404) return;
        if (upstream === 401 || upstream === 403) throw Object.assign(new Error("The provider rejected this key."), { status: 400 });
        throw Object.assign(new Error((error as Error).message), { status: 400 });
      }
    },
  };
}
