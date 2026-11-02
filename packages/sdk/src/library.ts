import { createHash } from "node:crypto";
import type { FxAgentTool, FxToolContext, FxToolResult } from "libfx";
import { anyWords, cutBytes } from "./history.ts";
import { isId, newId, type Sql } from "./store.ts";
import { itemKinds, type ItemKind, type LibraryItem, type LibraryPage, type LibraryQuery } from "./types.ts";

const fail = (status: 400 | 404, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

// The image types libfx takes, each checked by the bytes it starts with.
const magic: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  "image/jpeg": (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/gif": (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};
export const isImage = (type: string) => Object.hasOwn(magic, type);

// What `library_save` takes, by the name's extension.
const documentTypes: Record<string, string> = { md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json" };

export type NewItem = { profileId: string; sessionId: string; origin: "uploaded" | "generated"; name: string; type: string; bytes: Buffer };

// A file as the library keeps it: an image whose bytes are its type, or a document of UTF-8 text with no NUL.
export function check({ name, type, bytes }: Pick<NewItem, "name" | "type" | "bytes">) {
  if (typeof name !== "string" || !name.trim() || name.length > 255) return fail(400, "a file name must be 1 to 255 characters");
  if (isImage(type)) return magic[type](bytes) ? { kind: "image" as const, type, text: "" } : fail(400, `${name} is not the ${type} it says it is`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail(400, `${name} is not an image or a text file`);
  }
  if (text.includes("\0")) fail(400, `${name} is not an image or a text file`);
  // Only checked images claim an image type, so an SVG, which is text, is kept as plain text.
  return { kind: "document" as const, type: /^(?!image\/)[\w.+-]{1,60}\/[\w.+-]{1,60}$/.test(type) ? type : "text/plain", text };
}

// The library page's search words: as a bot's (`anyWords`), but all of them must match, since a search box narrows.
const tsquery = (q: string) =>
  (q.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 8)
    .map((word) => `${word}:*`)
    .join(" & ");
const clamp = (value: unknown, fallback: number, max: number) => Math.min(Math.max(Math.trunc(Number(value) || fallback), 1), max);
const botOf = (call: FxToolContext) => (call.context as { bot?: string } | undefined)?.bot;
const unavailable = "The library is unavailable in this chat.";
// A document is read up to this many bytes, under libfx's 64 KiB for a tool result, with room for its name and the note.
const readBytes = 60_000;

type Row = Omit<LibraryItem, "url">;
const item = (row: Row): LibraryItem => ({ ...row, url: `/api/library/${row.id}/file` });

// One copy of each file, by its SHA-256, with a tag for every bot and chat that saved it. A listing never reads the bytes.
export function createLibrary(sql: Sql) {
  // Dates go out as text to the microsecond, so a page's `next` matches the stored time exactly.
  const listed = sql`l.id, l.kind, l.origin, l.name, l.type, l.size, left(l.text, 200) as preview,
    to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
    to_char(max(t.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as saved_at, jsonb_agg(distinct t.profile_id) as profile_ids`;

  async function get(id: string) {
    if (typeof id !== "string" || !isId(id)) fail(404, "item not found");
    const [row] = await sql<Row[]>`select ${listed} from library l join library_tags t on t.item_id = l.id where l.id = ${id} group by l.id`;
    return row ? item(row) : fail(404, "item not found");
  }

  // Inserts the bytes, or finds the item that holds them, and tags it for the bot and chat, in one statement. The
  // same bot and chat again adds no tag. The first save's name, origin, and type stay.
  async function save(input: NewItem) {
    const { kind, type, text } = check(input);
    const { profileId, sessionId, origin, bytes } = input;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const [{ id }] = await sql<{ id: string }[]>`
      with item as (insert into library (id, sha256, kind, origin, name, type, size, data, text)
          values (${newId()}, ${sha256}, ${kind}, ${origin}, ${input.name.trim()}, ${type}, ${bytes.length}, ${bytes}, ${text})
          on conflict (sha256) do update set sha256 = excluded.sha256 returning id),
        tag as (insert into library_tags (item_id, profile_id, session_id) select id, ${profileId}, ${sessionId} from item on conflict do nothing)
      select id from item`;
    return get(id);
  }

  // Ordered by each item's newest tag among those the query covers, then by id, so `before` pages without repeats.
  async function list(query: LibraryQuery = {}): Promise<LibraryPage> {
    const { q = "", profileId, kind, before, limit = 60 } = query ?? {};
    if (typeof q !== "string" || q.length > 500) fail(400, "q must be at most 500 characters");
    if (profileId !== undefined && !isId(String(profileId))) fail(400, "profile must be a bot id");
    if (kind !== undefined && !itemKinds.includes(kind)) fail(400, `kind must be one of ${itemKinds.join(", ")}`);
    const cursor = before === undefined ? null : (/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z),([0-9a-f]{12})$/.exec(String(before)) ?? fail(400, "before must be a page's next"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "limit must be 1 to 100");
    const words = tsquery(q);
    // `::text` first: Postgres.js sends a timestamptz parameter through a JS Date, which keeps only milliseconds.
    const rows = await sql<Row[]>`select ${listed} from library l join library_tags t on t.item_id = l.id
      where ${profileId ? sql`t.profile_id = ${profileId}` : sql`true`} and ${kind ? sql`l.kind = ${kind}` : sql`true`}
        and ${words ? sql`l.tsv @@ to_tsquery('simple', ${words})` : sql`true`}
      group by l.id ${cursor ? sql`having (max(t.created_at), l.id) < (${cursor[1]}::text::timestamptz, ${cursor[2]})` : sql``}
      order by max(t.created_at) desc, l.id desc limit ${limit + 1}`;
    const items = rows.slice(0, limit).map(item);
    const last = items.at(-1);
    return { items, next: rows.length > limit && last ? `${last.savedAt},${last.id}` : null };
  }

  // The bytes, unless `ifNoneMatch` names the stored hash: then `data` is null and the bytes stay unread.
  async function fileWhere(column: "id" | "sha256", value: string, ifNoneMatch = "") {
    const [row] = await sql<{ name: string; kind: ItemKind; type: string; sha256: string; data: Buffer | null }[]>`
      select name, kind, type, sha256, case when strpos(${ifNoneMatch}, '"' || sha256 || '"') > 0 then null else data end as data
      from library where ${sql(column)} = ${value}`;
    return row ?? fail(404, "not found");
  }

  const tools: FxAgentTool[] = [
    {
      name: "library_search",
      description:
        "Search this bot's library: the files people sent it and the documents it saved, across all of its chats. " +
        "An item matching any of the words, in its name or a document's text, counts; more matches rank higher, and a word also matches " +
        "longer words it starts. An empty query lists the newest items. Each match is named library:<id>; open one with library_read.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to look for, or empty for the newest items" },
          kind: { type: "string", enum: [...itemKinds] },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
      },
      idempotent: true,
      async execute(input: { query?: unknown; kind?: unknown; limit?: unknown }, call) {
        const bot = botOf(call);
        if (!bot) return unavailable;
        const words = anyWords(String(input.query ?? ""));
        const kind = itemKinds.find((k) => k === input.kind);
        const match = sql`to_tsquery('simple', ${words})`;
        const rows = await sql<{ id: string; kind: string; name: string; savedAt: Date; snippet: string }[]>`
          select l.id, l.kind, l.name, max(t.created_at) as saved_at,
            ${words ? sql`ts_headline('simple', case when l.kind = 'document' then left(l.text, 200000) else l.name end, ${match}, 'MaxWords=30, MinWords=10')` : sql`left(l.text, 160)`} as snippet
          from library l join library_tags t on t.item_id = l.id
          where t.profile_id = ${bot} ${kind ? sql`and l.kind = ${kind}` : sql``} ${words ? sql`and l.tsv @@ ${match}` : sql``}
          group by l.id order by ${words ? sql`ts_rank_cd(l.tsv, ${match}) desc,` : sql``} max(t.created_at) desc limit ${clamp(input.limit, 8, 20)}`;
        if (!rows.length) return "Nothing in this bot's library matches.";
        return rows
          .map((r) => `[${r.savedAt.toISOString().slice(0, 10)}] library:${r.id} ${r.kind} ${JSON.stringify(r.name)}${r.snippet ? `: ${r.snippet.replace(/\s+/g, " ")}` : ""}`)
          .join("\n");
      },
    },
    {
      name: "library_read",
      description: "Open an item from this bot's library by its library:<id>: a document's text, or an image to look at.",
      inputSchema: { type: "object", properties: { id: { type: "string", description: "library:<id>" } }, required: ["id"] },
      idempotent: true,
      async execute(input: { id?: unknown }, call) {
        const bot = botOf(call);
        if (!bot) return unavailable;
        const id = String(input.id ?? "").trim().replace(/^library:/, "");
        const [row] = isId(id)
          ? await sql<{ kind: string; name: string; type: string; chars: number; text: string; data: Buffer | null }[]>`
              select kind, name, type, length(text) as chars, left(text, ${readBytes}) as text, case when kind = 'image' then data end as data
              from library l where id = ${id} and exists (select 1 from library_tags t where t.item_id = l.id and t.profile_id = ${bot})`
          : [];
        if (!row) return `This bot's library has no item library:${id}.`;
        if (row.data) return { type: "libfx.tool-result", text: row.name, images: [{ type: "image", mimeType: row.type, data: row.data.toString("base64"), sourceRef: `library:${id}` }] } satisfies FxToolResult;
        const text = cutBytes(row.text, readBytes);
        const kept = [...text].length;
        const cut = kept < row.chars ? `\n\n[cut at ${kept.toLocaleString("en-US")} of ${row.chars.toLocaleString("en-US")} characters]` : "";
        return `${row.name}\n\n${text}${cut}`;
      },
    },
    {
      name: "library_save",
      description:
        "Save a document you wrote to this bot's library, when the person wants to keep it. The name ends in .md, .txt, .csv, or .json, and the text is at most 1 MiB. " +
        "Returns its library:<id>; refer to saved items by that id.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "A file name, such as trip-plan.md" }, text: { type: "string", description: "The whole document" } },
        required: ["name", "text"],
      },
      // The same call again saves the same bytes for the same bot and chat, which hands back the item and adds nothing.
      idempotent: true,
      async execute(input: { name?: unknown; text?: unknown }, call) {
        const bot = botOf(call);
        if (!bot) return unavailable;
        const name = String(input.name ?? "").trim();
        const type = documentTypes[/\.(\w+)$/.exec(name)?.[1].toLowerCase() ?? ""];
        if (!type) return "Not saved: the name must end in .md, .txt, .csv, or .json.";
        if (typeof input.text !== "string") return "Not saved: text must be a string.";
        const bytes = Buffer.from(input.text, "utf8");
        if (bytes.length > 1 << 20) return "Not saved: a document is at most 1 MiB.";
        try {
          const saved = await save({ profileId: bot, sessionId: call.sessionId, origin: "generated", name, type, bytes });
          return `Saved ${JSON.stringify(saved.name)} to the library as library:${saved.id}.`;
        } catch (error) {
          return `Not saved: ${(error as Error).message}.`;
        }
      },
    },
  ];

  return {
    check,
    save,
    list,
    get,
    file: (id: string, ifNoneMatch?: string) => (isId(id) ? fileWhere("id", id, ifNoneMatch) : fail(404, "not found")),
    // The URL an image had before the library: the bot's id, then the SHA-256 and extension.
    upload(name: string, ifNoneMatch?: string) {
      const sha256 = /^([0-9a-f]{64})\.(png|jpg|gif|webp)$/.exec(name)?.[1];
      return sha256 ? fileWhere("sha256", sha256, ifNoneMatch) : fail(404, "not found");
    },
    // The one copy, for every bot it is tagged with. libfx's sessions keep their own.
    async remove(id: string) {
      if (!isId(id) || !(await sql`delete from library where id = ${id} returning id`).length) fail(404, "item not found");
    },
    tools,
  };
}

export type Library = ReturnType<typeof createLibrary>;
