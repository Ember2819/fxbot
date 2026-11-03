import { existsSync } from "node:fs";
import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { createWorld as files } from "@workflow/world-local";
import type { createWorld } from "@workflow/world-postgres";
import type postgres from "postgres";

type World = ReturnType<typeof createWorld>;
type Event = { eventId: string; eventType: string; correlationId?: string; eventData?: unknown; specVersion?: number };

const slot = (event: { eventId: string }) => /_(\d+)$/.exec(event.eventId)?.[1];

// The time in a run id: the first 10 characters of its ULID, in Crockford's base 32.
const began = (runId: string) => [...runId.slice(5, 15).toUpperCase()].reduce((ms, c) => ms * 32 + "0123456789ABCDEFGHJKMNPQRSTVWXYZ".indexOf(c), 0);

// world-postgres refuses a run_created whose run id is more than a day old (@workflow/world's validateUlidTimestamp),
// and a chat keeps its id. The check reads the clock with `new Date()` before create's first await, so the clock
// reads the time the chat began only for that synchronous step, and nothing else runs while it does.
function create(to: World, runId: string, event: object) {
  const Real = globalThis.Date;
  const at = began(runId) + 1000;
  globalThis.Date = class extends Real {
    constructor(...args: []) {
      super(...((args.length ? args : [at]) as []));
    }
    static now = () => at;
  } as DateConstructor;
  try {
    return to.events.create(runId, event as never);
  } finally {
    globalThis.Date = Real;
  }
}

// Chats from before 0.4.0, in libfx's files under FXBOT_DATA/sessions, move into the World through its own APIs, so
// each event keeps its slot and each line its cursor, and sessions keep their ids. A run moves its streams and then its
// events, so a run with all its events is in. One a stopped start left partway is removed and moved again. Once all
// are in, the folder is renamed, and stays for the owner to delete.
export async function moveSessions(sql: postgres.Sql, to: World, dataDir: string) {
  const dir = join(dataDir, "sessions");
  if (!existsSync(join(dir, "runs"))) return;
  const from = files({ dataDir: dir, recoverActiveRuns: false });
  const runs = (await readdir(join(dir, "runs"))).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
  const started = Date.now();
  let moved = 0;
  let lines = 0;
  for (const runId of runs.sort()) {
    try {
      const events: Event[] = [];
      for (let cursor: string | undefined; ; ) {
        const page = await from.events.list({ runId, pagination: { sortOrder: "asc", limit: 1000, ...(cursor ? { cursor } : {}) }, resolveData: "all" });
        events.push(...(page.data as Event[]));
        if (!page.hasMore) break;
        cursor = page.cursor ?? undefined;
      }
      // A run with no log holds nothing libfx can open.
      if (!events.length) continue;
      const [{ there }] = await sql<{ there: number }[]>`select count(*)::int as there from workflow.workflow_events where run_id = ${runId}`;
      if (there === events.length) continue;
      await forget(sql, runId);
      moved++;
      for (const name of await from.streams.list(runId)) {
        let count = 0;
        // world-local lists the whole stream again for each page, so pages are big. Each insert takes 1,000, under
        // Postgres's limit on parameters.
        for (let cursor: string | undefined; ; ) {
          const page = await from.streams.getChunks(runId, name, { limit: 50_000, ...(cursor ? { cursor } : {}) });
          for (let at = 0; at < page.data.length; at += 1000)
            await to.streams.writeMulti!(runId, name, page.data.slice(at, at + 1000).map((chunk) => chunk.data));
          count += page.data.length;
          if (page.done && !page.hasMore) await to.streams.close!(runId, name);
          if (!page.hasMore) break;
          cursor = page.cursor ?? undefined;
        }
        const [{ copied }] = await sql<{ copied: number }[]>`select count(*)::int as copied from workflow.workflow_stream_chunks where stream_id = ${name} and not eof`;
        if (copied !== count) throw new Error(`its stream has ${copied} lines in the database, not ${count}`);
        lines += count;
      }
      for (const { eventId, eventType, correlationId, eventData, specVersion } of events) {
        const event = { eventType, ...(correlationId ? { correlationId } : {}), ...(eventData ? { eventData } : {}), ...(specVersion ? { specVersion } : {}) };
        const made = (await (eventType === "run_created" ? create(to, runId, event) : to.events.create(runId, event as never))) as { event: { eventId: string } };
        if (slot(made.event) !== slot({ eventId })) throw new Error(`event ${eventId} landed at ${made.event.eventId}`);
      }
    } catch (error) {
      throw new Error(`Cannot move the chat ${runId} into the database, so fxbot didn't start. Its files are untouched: ${(error as Error).message}`);
    }
  }
  await (from as { close?: () => Promise<void> }).close?.();
  let kept = join(dataDir, "sessions.moved");
  if (existsSync(kept)) kept += `-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await rename(dir, kept);
  console.log(`fxbot moved ${moved} chats, ${lines} lines, into the database in ${((Date.now() - started) / 1000).toFixed(1)} s. The old files are in ${kept}.`);
}

// A run's rows in every World table, from a move that stopped partway, if there are any.
async function forget(sql: postgres.Sql, runId: string) {
  const tables = await sql<{ tableName: string }[]>`select table_name from information_schema.columns where table_schema = 'workflow' and column_name = 'run_id'`;
  await sql.begin(async (tx) => {
    for (const { tableName } of tables) await tx`delete from ${tx(`workflow.${tableName}`)} where run_id = ${runId}`;
    await tx`delete from workflow.workflow_runs where id = ${runId}`;
  });
}
