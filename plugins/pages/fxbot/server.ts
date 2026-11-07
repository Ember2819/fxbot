import { Script } from "node:vm";
import type { PluginApi } from "@fxbot/sdk";

// Pages: what a bot writes for the owner to read and keep, outside the chat. A page is a document in the library, so
// search, the library's screens, and library_read need nothing here, and it outlives this plugin. Here are the tools
// that write one, its versions, and the frame an HTML page runs in (docs/_completed/phases/pages.md).

type Call = { bot: string; session: string; messageId?: string };
type Version = { n: number; message_id: string | null; session: string; title: string; type: string; text: string; at: Date };
type Input = Record<string, unknown>;

const markdown = "text/markdown";
const html = "text/html";
// Under what library_read reads, so a page always fits one read, and the bot sees all of it.
const most = 60_000;
const mostEdits = 20;
const sandbox = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox";
// An HTML page gets an opaque origin, so it can't reach the app, and it loads nothing. Images are embedded before it's
// served. A header can't be undone by the page, and it holds when the address is opened alone in a tab.
const frame = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; ${sandbox}`,
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

const idOf = (value: unknown) => String(value ?? "").trim().replace(/^library:/, "");
const nameOf = (title: string, type: string) => `${title}.${type === html ? "html" : "md"}`;
const said = (title: string, id: string, n: number) =>
  `Saved ${JSON.stringify(title)} as library:${id}, version ${n}. The owner sees a card here that opens it, so don't repeat the page: say in a sentence or two what it covers. Anywhere else, such as a room, link it as [${title}](/pages/${id}).`;
const notYours = (id: string) => `No page library:${id} of yours.`;

// What's wrong with a page, if anything.
function refused(title: string, text: unknown) {
  if (!title || title.length > 120 || /[\r\n]/.test(title)) return "Not saved: a title is one line of 1 to 120 characters.";
  if (typeof text !== "string" || !text.trim()) return "Not saved: a page needs its text.";
  const size = Buffer.byteLength(text);
  if (size > most) return `Not saved: a page is at most ${most.toLocaleString("en-US")} bytes, and this is ${size.toLocaleString("en-US")}. Shorten it, or make it two pages.`;
}

// Compiles each classic inline script, which runs nothing. A bot can't see its page, so this is what it gets told. A
// module and a data block aren't judged.
function brokenScript(page: string) {
  let n = 0;
  for (const [, attributes, code, close] of page.matchAll(/<script\b([^>]*)>([\s\S]*?)(<\/script\s*>|$)/gi)) {
    n += 1;
    if (!close) return `Not saved: script ${n} has no </script>, so the page was cut off.`;
    if (/\bsrc\s*=/i.test(attributes) || (/\btype\s*=/i.test(attributes) && !/\btype\s*=\s*["']?(text|application)\/(java|ecma)script/i.test(attributes))) continue;
    try {
      new Script(code);
    } catch (error) {
      return `Not saved: script ${n} doesn't parse: ${(error as Error).message}.`;
    }
  }
}

export default async function setup(fx: PluginApi) {
  const newest = async (id: string) => (await fx.sql<Version[]>`select * from versions where page = ${id} order by n desc limit 1`)[0];
  const owns = async (id: string, bot: string) => (await fx.sql`select 1 from pages where id = ${id} and bot = ${bot}`).length > 0;

  // A turn keeps one version, so going back is going back to before that request. A restore has no turn.
  async function keep(id: string, messageId: string | null, session: string, title: string, type: string, text: string) {
    const last = await newest(id);
    if (messageId && last?.message_id === messageId) {
      await fx.sql`update versions set title = ${title}, type = ${type}, text = ${text}, session = ${session}, at = now() where page = ${id} and n = ${last.n}`;
      return last.n;
    }
    const n = (last?.n ?? 0) + 1;
    await fx.sql`insert into versions (page, n, message_id, session, title, type, text) values (${id}, ${n}, ${messageId}, ${session}, ${title}, ${type}, ${text})`;
    return n;
  }

  // A page's next version: in the library first, since that's what a bot and the owner find.
  async function revise(id: string, { bot, session, messageId }: Call, title: string, type: string, text: string) {
    const last = await newest(id);
    if (last?.title === title && last.type === type && last.text === text) return said(title, id, last.n);
    try {
      await fx.library.replace({ bot, session, id, name: nameOf(title, type), type, bytes: Buffer.from(text) });
      return said(title, id, await keep(id, messageId ?? null, session, title, type, text));
    } catch (error) {
      return `Not saved: ${(error as Error).message}.`;
    }
  }

  // The library hands back the item that already holds this text, if one does: so the same call again finds its own page,
  // and an upload stays the owner's.
  async function make({ bot, session, messageId }: Call, title: string, type: string, text: string) {
    const item = await fx.library.save({ bot, session, name: nameOf(title, type), type, bytes: Buffer.from(text) });
    if (item.origin === "uploaded") return `Not saved: the owner sent this text, as library:${item.id}.`;
    const [page] = await fx.sql<{ bot: string }[]>`insert into pages (id, bot) values (${item.id}, ${bot}) on conflict (id) do update set id = excluded.id returning bot`;
    if (page.bot !== bot) return `Not saved: another bot's page has this text, as library:${item.id}.`;
    const last = await newest(item.id);
    return said(last?.title ?? title, item.id, last?.n ?? (await keep(item.id, messageId ?? null, session, title, type, text)));
  }

  async function write(input: Input, call: Call, type: string, text: unknown) {
    const title = String(input.title ?? "").trim();
    const problem = refused(title, text) ?? (type === html ? brokenScript(text as string) : undefined);
    if (problem) return problem;
    if (input.id === undefined || input.id === "") return make(call, title, type, text as string);
    const id = idOf(input.id);
    return (await owns(id, call.bot)) ? revise(id, call, title, type, text as string) : notYours(id);
  }

  fx.tool({
    name: "write",
    description:
      "Write a page for the owner to read and keep: a report, a guide, a plan, or a summary of a project. Use it when they ask for something to keep or come back to, not for a short answer. " +
      `It's Markdown, at most ${most.toLocaleString("en-US")} bytes: headings, tables, code, and images from the library, as ![what it shows](library:<id>). Leave the title out of the text. ` +
      "To rewrite a page, give its library:<id>. For a small change, use pages_edit.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, text: { type: "string", description: "The whole page, in Markdown" }, id: { type: "string", description: "library:<id>, to rewrite that page" } },
      required: ["title", "text"],
    },
    idempotent: true,
    safe: true,
    execute: (input: Input, call) => write(input, call, markdown, input.text),
  });

  fx.tool({
    name: "edit",
    description:
      "Change part of a page you wrote, by its library:<id>, without writing it again. Each old_string must match exactly once. The edits apply in order and save as one version, or not at all. " +
      "library_read shows the page as it stands.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "library:<id>" },
        edits: { type: "array", minItems: 1, maxItems: mostEdits, items: { type: "object", properties: { old_string: { type: "string" }, new_string: { type: "string" } }, required: ["old_string", "new_string"] } },
      },
      required: ["id", "edits"],
    },
    idempotent: false,
    safe: true,
    async execute(input: Input, call) {
      const id = idOf(input.id);
      if (!(await owns(id, call.bot))) return notYours(id);
      const last = await newest(id);
      if (last.type === html) return `library:${id} is HTML, so change it with pages_html.`;
      const edits = input.edits as { old_string?: unknown; new_string?: unknown }[];
      if (!Array.isArray(edits) || !edits.length || edits.length > mostEdits) return `Not saved: give 1 to ${mostEdits} edits.`;
      let text = last.text;
      for (const [i, edit] of edits.entries()) {
        const { old_string: before, new_string: after } = edit ?? {};
        if (typeof before !== "string" || !before || typeof after !== "string") return `Not saved: edit ${i + 1} needs an old_string and a new_string.`;
        const at = text.indexOf(before);
        if (at < 0) return `Not saved: edit ${i + 1}'s old_string matches nothing. library_read shows the page as it stands.`;
        if (text.includes(before, at + 1)) return `Not saved: edit ${i + 1}'s old_string matches more than once. Give more of the text around it.`;
        text = text.slice(0, at) + after + text.slice(at + before.length);
      }
      return refused(last.title, text) ?? revise(id, call, last.title, markdown, text);
    },
  });

  // Not `safe`: its scripts run when the owner opens it, and a script can move its own frame to another address.
  fx.tool({
    name: "html",
    description:
      "Write a page as one HTML document, for what Markdown can't do: a chart, filters and controls, or a designed layout. Use pages_write for everything else, since this costs far more to write. " +
      `It's self-contained, at most ${most.toLocaleString("en-US")} bytes, with its CSS and JavaScript inline, and it can load nothing: no network, no CDN, and no outside fonts. ` +
      'Images come from the library, as <img src="library:<id>">. It must read on a phone 375 pixels wide, in light and dark. Give outside links target="_blank". ' +
      "To change a page, give its library:<id> and the whole document.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, html: { type: "string", description: "The whole document" }, id: { type: "string", description: "library:<id>, to rewrite that page" } },
      required: ["title", "html"],
    },
    idempotent: true,
    execute: (input: Input, call) => write(input, call, html, input.html),
  });

  // A page the owner deleted leaves no old text behind. No table of a plugin's points at core's, so this does what a
  // foreign key would.
  fx.on("library.removed", async ({ id }) => void (await fx.sql`delete from pages where id = ${id}`));

  const version = async (id: string, n: string) => (await fx.sql<Version[]>`select * from versions where page = ${id} and n = ${Number(n) || 0}`)[0];
  const gone = () => Response.json({ error: "That page is gone." }, { status: 404 });

  fx.route("GET", "/:id", async (_request, { id }) => {
    const [page] = await fx.sql<{ bot: string }[]>`select bot from pages where id = ${id}`;
    if (!page) return gone();
    const versions = await fx.sql<Pick<Version, "n" | "title" | "at">[]>`select n, title, at from versions where page = ${id} order by n desc`;
    return Response.json({ id, bot: page.bot, title: versions[0].title, at: versions[0].at, versions });
  });

  fx.route("GET", "/:id/versions/:n", async (_request, { id, n }) => {
    const row = await version(id, n);
    return row ? Response.json({ n: row.n, title: row.title, type: row.type, text: row.text, at: row.at }) : gone();
  });

  // Only the bot's own images, so a page can't show what another bot keeps.
  fx.route("GET", "/:id/versions/:n/frame", async (_request, { id, n }) => {
    const row = await version(id, n);
    if (row?.type !== html) return gone();
    const [{ bot }] = await fx.sql<{ bot: string }[]>`select bot from pages where id = ${id}`;
    let body = row.text;
    for (const image of new Set([...body.matchAll(/library:([0-9a-f]{12})/g)].map((match) => match[1]))) {
      const item = await fx.library.read(bot, image).catch(() => null);
      if (item?.type.startsWith("image/")) body = body.replaceAll(`library:${image}`, `data:${item.type};base64,${item.bytes.toString("base64")}`);
    }
    return new Response(body, { headers: frame });
  });

  // That version again, as the newest, so going back loses nothing.
  fx.route("POST", "/:id/restore", async (request, { id }) => {
    const [page] = await fx.sql<{ bot: string }[]>`select bot from pages where id = ${id}`;
    const row = await version(id, String(((await request.json().catch(() => ({}))) as { n?: unknown }).n));
    if (!page || !row) return gone();
    const answer = await revise(id, { bot: page.bot, session: (await newest(id)).session }, row.title, row.type, row.text);
    return answer.startsWith("Saved") ? Response.json({ ok: true }) : Response.json({ error: answer }, { status: 409 });
  });
}
