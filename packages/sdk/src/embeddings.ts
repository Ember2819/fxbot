import type { Sql } from "./store.ts";

// Vectors for meaning search, from the machine's local embedder (an OpenAI-style /embeddings at `localUrl`), from a
// provider that serves /embeddings, or from none. One loop fills in the vectors that rows lack: memories first, then
// messages, newest first, 32 to a request. Search compares only the current model's vectors, so a change of model never
// mixes sizes, and falls back to words when there is no vector to compare.

export type Embedder = "local" | "remote" | "off";
export type EmbeddingSettings = { embedder: Embedder; embeddingProvider: string; embeddingModel: string; messageVectors: number };
// Where a provider serves /embeddings, and what its requests need.
export type EmbeddingsTarget = { url: string; apiKey?: string; fetch: typeof globalThis.fetch };
type Source = { model: string; url: string; headers: Record<string, string>; fetch: typeof globalThis.fetch };

const defaults: EmbeddingSettings = { embedder: "local", embeddingProvider: "", embeddingModel: "", messageVectors: 8000 };
const batch = 32;
const retry = 60_000;

// Each model's prefixes for a search and for what it searches, from its card. Other models get none.
const prefixes: [RegExp, string, string][] = [
  [/embeddinggemma/i, "task: search result | query: ", "title: none | text: "],
  [/qwen3-embedding/i, "Instruct: Given a question, retrieve the notes and messages that answer it\nQuery:", ""],
  [/nomic-embed/i, "search_query: ", "search_document: "],
  [/bge-/i, "Represent this sentence for searching relevant passages: ", ""],
];
const prefixFor = (model: string, kind: "query" | "document") => {
  const found = prefixes.find(([pattern]) => pattern.test(model));
  return found ? found[kind === "query" ? 1 : 2] : "";
};

// How far past the nearest vector a meaning match may be, in cosine distance. Distances aren't comparable across
// queries, so a fixed cutoff lets everything in or nothing: with EmbeddingGemma 2, the nearest note to a query sat 0.20
// to 0.30 away and unrelated ones 0.29 to 0.41, and keeping those within 0.05 of the nearest kept the matches.
export const near = 0.05;

// pgvector's text form.
export const asVector = (values: number[]) => `[${values.join(",")}]`;

// Reciprocal rank fusion: a row scores 1 / (60 + its rank) in each list it is in, summed, and rows are matched by id.
export function fuse<T extends { id: string }>(lists: T[][]): T[] {
  const scores = new Map<string, { row: T; score: number }>();
  for (const list of lists)
    list.forEach((row, rank) => {
      const entry = scores.get(row.id) ?? { row, score: 0 };
      entry.score += 1 / (60 + rank + 1);
      scores.set(row.id, entry);
    });
  return [...scores.values()].sort((a, b) => b.score - a.score).map((entry) => entry.row);
}

// An embedder's error, and whether it said the input was too large.
const failure = (message: string, tooLarge = false) => Object.assign(new Error(message), { tooLarge });
const tooLarge = (error: unknown) => (error as { tooLarge?: boolean }).tooLarge === true;

export function createEmbeddings({ sql, fetch, localUrl, target }: { sql: Sql; fetch: typeof globalThis.fetch; localUrl?: string; target: (provider: string) => Promise<EmbeddingsTarget> }) {
  let local: { model: string; at: number } | null = null;
  let lastError: string | null = null;
  let running = false;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  async function settings(): Promise<EmbeddingSettings> {
    const [row] = await sql<EmbeddingSettings[]>`select embedder, coalesce(embedding_provider, '') as embedding_provider, embedding_model, message_vectors from settings`;
    return row ?? defaults;
  }

  // The local embedder names the model it serves; it may still be starting, or downloading its model.
  async function localModel() {
    if (local && Date.now() - local.at < 60_000) return local.model;
    const res = await fetch(`${localUrl}/models`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { data?: { id?: string }[] } | null) : null;
    const model = body?.data?.[0]?.id;
    if (!model) throw failure("The local embedder isn't answering yet. On its first start it downloads its model.");
    local = { model, at: Date.now() };
    return model;
  }

  async function source(now?: EmbeddingSettings): Promise<Source | null> {
    const chosen = now ?? (await settings());
    if (chosen.embedder === "off") return null;
    if (chosen.embedder === "remote") {
      if (!chosen.embeddingProvider || !chosen.embeddingModel) return null;
      const where = await target(chosen.embeddingProvider);
      return { model: chosen.embeddingModel, url: where.url, headers: where.apiKey ? { authorization: `Bearer ${where.apiKey}` } : {}, fetch: where.fetch };
    }
    if (!localUrl) throw failure("This fxbot has no local embedder. Set FXBOT_EMBED_URL, or pick a provider's model or Off.");
    return { model: await localModel(), url: `${localUrl}/embeddings`, headers: {}, fetch };
  }

  async function call(from: Source, input: string[], signal?: AbortSignal) {
    const res = await from.fetch(from.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...from.headers },
      body: JSON.stringify({ model: from.model, input }),
      signal: signal ?? AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw failure(`The embedder answered ${res.status}: ${text}`, /too large/i.test(text));
    }
    const body = (await res.json()) as { data?: { index?: number; embedding?: number[] }[] };
    const data = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (data.length !== input.length || data.some((d) => !Array.isArray(d.embedding))) throw failure("The embedder's answer has no vectors.");
    return data.map((d) => d.embedding!);
  }

  // With each model's prefix. An input the embedder calls too large is sent alone, at half its length until it fits;
  // its tail is still found by words.
  async function embed(from: Source, texts: string[], kind: "query" | "document", signal?: AbortSignal) {
    const prefix = prefixFor(from.model, kind);
    try {
      return await call(from, texts.map((t) => prefix + t), signal);
    } catch (error) {
      if (!tooLarge(error)) throw error;
    }
    const vectors: number[][] = [];
    for (let text of texts)
      for (;;) {
        try {
          vectors.push((await call(from, [prefix + text], signal))[0]);
          break;
        } catch (error) {
          if (!tooLarge(error) || text.length < 2) throw error;
          text = text.slice(0, Math.floor(text.length / 2));
        }
      }
    return vectors;
  }

  // Up to 32 rows that lack a vector from the current model, embedded and saved, until none are left. A memory that
  // changed meanwhile keeps waiting for the next pass. A row with no text is marked done without a vector.
  async function fill() {
    if (running || closed) return;
    running = true;
    clearTimeout(timer);
    try {
      for (;;) {
        const chosen = await settings();
        const from = await source(chosen);
        if (!from) break;
        let table: "memories" | "messages" = "memories";
        // updated_at compared as text: postgres.js turns a timestamp through a JavaScript date, which drops Postgres's
        // microseconds, and would never match again.
        let rows = await sql<{ id: string; text: string; stamp: string | null }[]>`
          select id, text, updated_at::text as stamp from memories where embedded_with is distinct from ${from.model} order by updated_at desc limit ${batch}`;
        if (!rows.length && chosen.messageVectors > 0) {
          table = "messages";
          rows = await sql<{ id: string; text: string; stamp: string | null }[]>`
            select id, left(text, ${chosen.messageVectors}) as text, null as stamp from messages
            where embedded_with is distinct from ${from.model} order by id desc limit ${batch}`;
        }
        if (!rows.length) break;
        const full = rows.filter((r) => r.text.trim());
        const vectors = full.length ? await embed(from, full.map((r) => r.text), "document") : [];
        const saved = await sql.begin(async (tx) => {
          let count = 0;
          for (const [i, row] of full.entries()) {
            const vector = asVector(vectors[i]);
            const done =
              table === "memories"
                ? await tx`update memories set embedding = ${vector}::vector, embedded_with = ${from.model} where id = ${row.id} and updated_at::text = ${row.stamp}`
                : await tx`update messages set embedding = ${vector}::vector, embedded_with = ${from.model} where id = ${row.id}`;
            count += done.count;
          }
          for (const row of rows.filter((r) => !r.text.trim())) count += (await tx`update ${tx(table)} set embedded_with = ${from.model} where id = ${row.id}`).count;
          return count;
        });
        lastError = null;
        // Every row changed while it was embedded: the next nudge comes with the change.
        if (!saved) break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      local = null;
      if (!closed) (timer = setTimeout(() => void fill(), retry)).unref();
    } finally {
      running = false;
    }
  }

  return {
    settings,
    // A search's vector, or null for words alone: no embedder, or no answer within 5 seconds.
    async query(text: string): Promise<{ model: string; vector: string } | null> {
      try {
        const from = await source();
        if (!from || !text.trim()) return null;
        const [vector] = await embed(from, [text], "query", AbortSignal.timeout(5_000));
        return { model: from.model, vector: asVector(vector) };
      } catch {
        return null;
      }
    },
    // Whether messages get vectors, so chat_history can ask for them.
    messagesOn: async () => (await settings()).messageVectors > 0,
    // One embedding of a test string, for a source about to be picked: its model and its dimensions, or the reason.
    async test(next: EmbeddingSettings) {
      const from = await source(next);
      if (!from) return null;
      const [vector] = await embed(from, ["fxbot"], "document", AbortSignal.timeout(30_000));
      return { model: from.model, dimensions: vector.length };
    },
    async save(next: EmbeddingSettings) {
      await sql`insert into settings (id, embedder, embedding_provider, embedding_model, message_vectors)
        values (1, ${next.embedder}, ${next.embeddingProvider || null}, ${next.embeddingModel}, ${next.messageVectors})
        on conflict (id) do update set embedder = excluded.embedder, embedding_provider = excluded.embedding_provider,
          embedding_model = excluded.embedding_model, message_vectors = excluded.message_vectors`;
      local = null;
      void fill();
    },
    // How far the vectors have got, for Settings.
    async status() {
      const from = await source().catch((error: Error) => (lastError ??= error.message, null));
      const model = from?.model ?? null;
      // The embedder answers again: try now rather than at the next minute, which clears the error when it works.
      if (from && lastError && !running) void fill();
      const [counts] = await sql<{ messages: number; withVectors: number; memories: number; memoriesWithVectors: number }[]>`
        select (select count(*)::int from messages) as messages,
          (select count(*)::int from messages where embedded_with = ${model ?? ""}) as with_vectors,
          (select count(*)::int from memories) as memories,
          (select count(*)::int from memories where embedded_with = ${model ?? ""}) as memories_with_vectors`;
      return { model, error: lastError, ...counts };
    },
    // After a memory is saved or a message recorded, or at start.
    nudge: () => void fill(),
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

export type Embeddings = ReturnType<typeof createEmbeddings>;
