import { createFxEngine, type FxAgentTool } from "libfx";
import type { Turn } from "./client.ts";
import { fuse, near, type Embeddings } from "./embeddings.ts";
import type { Sql } from "./store.ts";
import type { Upload } from "./types.ts";

// What the summary on a provider switch asks for, after fx's compaction: requests in order, the rest summed up.
export const switchAsk =
  "Write a handoff summary of this conversation so far, for the assistant that continues it on another model. " +
  "Keep the user's requests in order, summarize the replies, decisions, and facts, and list open tasks. At most 1,500 words.";

// Search words for a bot's tools: runs of letters and digits, at most 8, each matching as a prefix. Any of them
// matches, and more of them rank higher, since a bot guesses at words. They need no escaping.
export const anyWords = (q: string) =>
  (q.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 8)
    .map((word) => `${word}:*`)
    .join(" | ");

// libfx refuses a host tool's result over 64 KiB of UTF-8 (libfx 0.0.16, checked by hand), so long text is cut to a
// byte budget, at a whole character: a UTF-8 continuation byte starts with the bits 10.
export function cutBytes(text: string, max: number) {
  const bytes = Buffer.from(text);
  let end = Math.min(bytes.length, max);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString();
}

const stamp = (at: Date) => at.toISOString().slice(0, 16).replace("T", " ");
// Messages read in full: up to 6 before the one asked for and 6 after it, each cut at 4,000 bytes, so all 13 fit.
const side = 6;
const messageBytes = 4_000;

type Row = { id: string; createdAt: Date; role: string; text: string; plugin: string | null };
// A bot's thinking and tool calls are rows too, for chat_history. What's said, by anyone, is these two.
type Role = "user" | "assistant" | "thinking" | "tool";
const said = ["user", "assistant"];
// Who said it. A plugin's message was saved as a user's, and another bot's words mustn't read as the owner's.
const speaker = (row: Row) => (row.role === "user" && row.plugin ? `from ${row.plugin}` : row.role);

// Everything a chat held as plain text: messages, the bot's thinking, and its tool calls, so a bot can search its own
// chats after a provider switch, and a switch can be summarized from them when the old provider cannot do it. With an
// embedder and message vectors on, a search also finds messages by meaning.
export function createHistory(sql: Sql, embeddings?: Embeddings) {
  const pluginOf = sql`(select s.plugin from sent s where s.profile_id = m.profile_id and s.message_id = m.message_id and m.role = 'user') as plugin`;
  // A message and its neighbours in the same chat, in full, oldest first. It reads 6 more on each side than it shows,
  // so the ids it names to page on give windows that meet this one end to end.
  async function around(bot: string, ref: string) {
    const id = /^(?:msg:)?(\d{1,18})$/.exec(ref.trim())?.[1];
    const rows = id
      ? await sql<(Row & { before: boolean })[]>`
          with target as (select id, session_id from messages where profile_id = ${bot} and id = ${id})
          select * from (select m.id, m.created_at, m.role, m.text, ${pluginOf}, true as before from messages m, target t
            where m.profile_id = ${bot} and m.session_id = t.session_id and m.id < t.id order by m.id desc limit ${2 * side + 1}) b
          union all
          select * from (select m.id, m.created_at, m.role, m.text, ${pluginOf}, false from messages m, target t
            where m.profile_id = ${bot} and m.session_id = t.session_id and m.id >= t.id order by m.id limit ${2 * side + 2}) a`
      : [];
    if (!rows.some((r) => r.id === id)) return `This bot has no message ${ref.trim()}.`;
    const before = rows.filter((r) => r.before).reverse();
    const after = rows.filter((r) => !r.before);
    const shown = [...before.slice(-side), ...after.slice(0, side + 1)];
    const lines = shown.map((r) => {
      const text = cutBytes(r.text, messageBytes);
      const note = text.length < r.text.length ? `\n[cut: ${r.text.length.toLocaleString("en-US")} characters in all]` : "";
      return `[${stamp(r.createdAt)}] msg:${r.id} ${speaker(r)}${r.id === id ? " (asked for)" : ""}:\n${text}${note}`;
    });
    const older = before.slice(0, -side);
    const newer = after.slice(side + 1);
    if (older.length) lines.unshift(`More before: around msg:${older[Math.max(older.length - 1 - side, 0)].id}`);
    if (newer.length) lines.push(`More after: around msg:${newer[Math.min(side, newer.length - 1)].id}`);
    return lines.join("\n\n");
  }

  const tool: FxAgentTool = {
    name: "chat_history",
    description:
      "Search this bot's history across all of its chats, or read it in full: what the owner and other bots said, its replies, its thinking, and its tool calls with their results. With query: a message matching any of the words counts, " +
      "more matches rank higher, a word also matches longer words it starts, and, with meaning search on, messages close in meaning count too. Returns the best matches oldest first, each with its date, " +
      "msg:<id>, and whether it is from an earlier chat. With around: a msg:<id>, reads that message and the ones before and after it in " +
      "its chat, in full; call again with the first or last id to page.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        around: { type: "string", description: "A msg:<id> from a search, to read in full with its neighbours" },
      },
    },
    idempotent: true,
    async execute(input: { query?: unknown; limit?: unknown; around?: unknown }, call) {
      // The bot is the session's, never the model's to choose.
      const bot = (call.context as { bot?: string } | undefined)?.bot;
      if (!bot) return "chat_history is unavailable in this chat.";
      if (typeof input.around === "string" && input.around.trim()) return around(bot, input.around);
      const words = anyWords(String(input.query ?? ""));
      if (!words) return "Give words to look for in query, or a msg:<id> in around.";
      const limit = Math.min(Math.max(Math.trunc(Number(input.limit) || 8), 1), 20);
      // The message that started this turn is already saved, and is left out: it is the search itself. The word
      // matches and the nearest vectors are fused, best first.
      const [byWords, byMeaning] = await Promise.all([
        sql<(Row & { here: boolean })[]>`
          select m.id, m.created_at, m.role, ${pluginOf}, m.session_id = ${call.sessionId} as here, ts_headline('simple', m.text, q, 'MaxWords=40, MinWords=15') as text
          from messages m, to_tsquery('simple', ${words}) q
          where m.profile_id = ${bot} and m.tsv @@ q
            and m.id <> coalesce((select max(id) from messages where profile_id = ${bot} and session_id = ${call.sessionId} and role = 'user'), 0)
          order by ts_rank_cd(m.tsv, q) desc, m.created_at desc limit 40`,
        (async () => {
          const close = embeddings && (await embeddings.messagesOn()) ? await embeddings.query(String(input.query)) : null;
          if (!close) return [] as (Row & { here: boolean })[];
          return sql<(Row & { here: boolean })[]>`
            with nearest as (
              select m.id, m.created_at, m.role, ${pluginOf}, m.session_id = ${call.sessionId} as here, m.text, m.embedding <=> ${close.vector}::vector as distance
              from messages m
              where m.profile_id = ${bot} and m.embedded_with = ${close.model} and m.embedding is not null
                and m.id <> coalesce((select max(id) from messages where profile_id = ${bot} and session_id = ${call.sessionId} and role = 'user'), 0)
              order by distance limit 40)
            select id, created_at, role, plugin, here, ts_headline('simple', text, to_tsquery('simple', ${words}), 'MaxWords=40, MinWords=15') as text
            from nearest where distance <= (select min(distance) from nearest) + ${near} order by distance`;
        })(),
      ]);
      const rows = fuse([byWords, byMeaning]).slice(0, limit);
      if (!rows.length) return "No earlier messages match.";
      // The best matches, in the order they were written.
      return rows
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((r) => `[${stamp(r.createdAt)}] msg:${r.id} ${speaker(r)}${r.here ? "" : " (earlier chat)"}: ${r.text.replace(/\s+/g, " ")}`)
        .join("\n");
    },
  };

  return {
    tool,
    // A new message also gets its vector, in the background. Thinking and tool calls are found by their words.
    async record(bot: string, sessionId: string, messageId: string, role: Role, text: string) {
      await sql`insert into messages (profile_id, session_id, message_id, role, text)
        values (${bot}, ${sessionId}, ${messageId}, ${role}, ${cutBytes(text, 64 * 1024)}) on conflict do nothing`;
      if (said.includes(role)) embeddings?.nudge();
    },
    // The bot's chats before `sessionId`, as finished turns, oldest first: the newest `limit` messages of them. A provider
    // switch starts a new session, and the old one may not open again, so the chat shows these above the handoff.
    // A message that sent files gets its saved text and files back.
    async earlier(bot: string, sessionId: string | null, limit = 400): Promise<Turn[]> {
      const rows = await sql<{ messageId: string; role: string; text: string; input: string | null; files: Upload[] | null; plugin: string | null }[]>`
        select m.message_id, m.role, m.text, s.input, s.files, s.plugin
        from (select * from messages where profile_id = ${bot} and session_id is distinct from ${sessionId} and role in ${sql(said)}
          and session_id not in (select id from plugin_sessions) order by id desc limit ${limit}) m
        left join sent s on m.role = 'user' and s.profile_id = m.profile_id and s.message_id = m.message_id
        order by m.id`;
      const turns = new Map<string, Turn>();
      for (const { messageId, role, text, input, files, plugin } of rows) {
        const turn = turns.get(messageId) ?? { messageId, text: "", reply: "", done: true };
        if (role === "user") Object.assign(turn, { text: input ?? text, ...(files?.length ? { files } : {}), ...(plugin ? { from: plugin } : {}) });
        else turn.reply = text;
        turns.set(messageId, turn);
      }
      return [...turns.values()];
    },
    // A session's messages, oldest first, as many of the newest as fit `maxChars`, or the last 100.
    async transcript(bot: string, sessionId: string, maxChars: number) {
      const rows = await sql<{ role: string; text: string }[]>`
        select role, text from messages where profile_id = ${bot} and session_id = ${sessionId} and role in ${sql(said)} order by id desc limit 100`;
      const kept: string[] = [];
      let size = 0;
      for (const { role, text } of rows) {
        const line = `${role}: ${text}`;
        if (size + line.length > maxChars && kept.length) break;
        kept.unshift(line);
        size += line.length;
      }
      return kept.join("\n\n");
    },
  };
}

// One tool-free request to a throwaway engine, asking `ask`. With `checkpoint`, the engine starts from the old
// session's own history; without it, `input` carries the transcript. Gives up after 2 minutes.
export async function summarize(options: Record<string, unknown>, model: string, instructions: string[], ask: string, checkpoint?: Uint8Array, transcript?: string) {
  // The provider options come from the same code that makes the provider's agent.
  const engine = await createFxEngine({ ...options, model, instructions, ...(checkpoint ? { checkpoint } : {}) } as unknown as Parameters<typeof createFxEngine>[0]);
  try {
    // A failed request rejects here; a refusal or a cut-off ends the turn with another stop reason.
    const turn = engine.prompt(transcript ? `${transcript}\n\n---\n\n${ask}` : ask, { signal: AbortSignal.timeout(120_000) });
    let text = "";
    for await (const event of turn) if (event.type === "text_delta") text += event.delta;
    const { stopReason } = await turn.result;
    // libfx retries a failing provider until the time runs out, which ends the turn cancelled.
    if (stopReason === "cancelled") throw new Error("the model didn't answer within 2 minutes.");
    if (stopReason !== "end_turn") throw new Error(`The summary stopped: ${stopReason}.`);
    if (!text.trim()) throw new Error("The summary came back empty.");
    return text.trim();
  } finally {
    await engine.close();
  }
}
