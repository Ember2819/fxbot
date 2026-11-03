import type { PluginApi, StreamLine } from "@fxbot/sdk";

// Chat rooms: the owner talks with several bots at once. Each of the owner's messages starts one round, in which each
// bot in the room answers once, in order, in a session of its own for the room, prompted with what was said since its
// last turn. Bots never start a round, so a room never runs on by itself.

type Room = { id: number; name: string; members: string[] };
type Message = { id: number; author: string; text: string; at: string };
// What the room's page hears: the room and its messages, then each new message, and the reply being written.
type Event =
  | { type: "room"; room: Room; messages: Message[]; replying: { bot: string; text: string } | null }
  | { type: "message"; message: Message }
  | { type: "reply"; bot: string; text: string }
  | { type: "idle" };

const json = (body: unknown, status = 200) => Response.json(body, { status });
const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

// NDJSON lines from a stream of bytes, read until it ends or is cancelled.
async function* lines(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    const parts = (rest + decoder.decode(value, { stream: true })).split("\n");
    rest = parts.pop()!;
    for (const part of parts) if (part) yield JSON.parse(part) as StreamLine;
  }
}

export default async function setup(fx: PluginApi) {
  const listeners = new Map<number, Set<(event: Event) => void>>();
  const emit = (room: number, event: Event) => listeners.get(room)?.forEach((listen) => listen(event));
  // The reply being written in each room, for a page that opens partway through.
  const replying = new Map<number, { bot: string; text: string }>();
  // One round at a time in each room.
  const rounds = new Map<number, Promise<void>>();
  // Which room each session is for, for the instructions hook.
  const roomOf = new Map<string, number>();
  for (const { room, session } of await fx.sql<{ room: number; session: string }[]>`select room, session from sessions`) roomOf.set(session, room);

  async function room(id: number): Promise<Room | null> {
    const [found] = await fx.sql<{ id: number; name: string }[]>`select id, name from rooms where id = ${id}`;
    if (!found) return null;
    const members = await fx.sql<{ bot: string }[]>`select bot from members where room = ${id} order by position`;
    return { ...found, members: members.map((m) => m.bot) };
  }
  const messages = (id: number) => fx.sql<Message[]>`select id, author, text, at from messages where room = ${id} order by id`;
  async function say(id: number, author: string, text: string) {
    const [message] = await fx.sql<Message[]>`insert into messages (room, author, text) values (${id}, ${author}, ${text}) returning id, author, text, at`;
    emit(id, { type: "message", message });
    return message;
  }
  const names = async () => new Map((await fx.bots.list()).map((bot) => [bot.id, bot.name]));

  // A bot in a room knows where it is, and who else is there.
  fx.on("instructions", async (event) => {
    const id = roomOf.get(event.session);
    const found = id === undefined ? null : await room(id);
    if (!found) return;
    const named = await names();
    const others = found.members.filter((bot) => bot !== event.bot).map((bot) => named.get(bot) ?? "another bot");
    event.instructions.push(
      `You are in a chat room, "${found.name}", with the owner${others.length ? ` and ${others.join(", ")}` : ""}. ` +
        'Each message you get holds what was said since your last turn, one line each as "Name: text". Answer as yourself, once and briefly, and don\'t speak for anyone else.',
    );
  });

  // One bot's turn: what was said since its last one, in its session for the room, made the first time and again after
  // the bot moves to another provider. Its reply is read from the session's stream, shown as it's written, and saved.
  async function answer(found: Room, bot: string) {
    let [kept] = await fx.sql<{ session: string; cursor: number; seen: number }[]>`select session, cursor, seen from sessions where room = ${found.id} and bot = ${bot}`;
    const named = await names();
    const unseen = await fx.sql<Message[]>`select id, author, text from messages where room = ${found.id} and id > ${kept?.seen ?? 0} and author <> 'note' order by id`;
    const heard = unseen.filter((m) => m.author !== bot).map((m) => `${m.author === "owner" ? "Owner" : (named.get(m.author) ?? "A bot")}: ${m.text}`);
    if (!heard.length) return;
    const text = heard.join("\n\n");
    const messageId = crypto.randomUUID();
    const fresh = async () => {
      const session = await fx.chats.newSession(bot);
      await fx.sql`insert into sessions (room, bot, session) values (${found.id}, ${bot}, ${session})
        on conflict (room, bot) do update set session = excluded.session, cursor = 0`;
      roomOf.set(session, found.id);
      kept = { session, cursor: 0, seen: kept?.seen ?? 0 };
    };
    if (!kept) await fresh();
    try {
      await fx.chats.send(bot, { text, session: kept!.session, messageId });
    } catch (error) {
      if ((error as { status?: number }).status !== 409) throw error;
      await fresh();
      await fx.chats.send(bot, { text, session: kept!.session, messageId });
    }
    let reply = "";
    let cursor = kept!.cursor;
    let failed = "";
    replying.set(found.id, { bot, text: "" });
    emit(found.id, { type: "reply", bot, text: "" });
    const reader = (await fx.chats.stream(bot, kept!.session, kept!.cursor)).getReader();
    const stop = () => void reader.cancel().catch(() => {});
    fx.signal.addEventListener("abort", stop);
    try {
      for await (const line of lines(reader)) {
        if (typeof line.cursor === "number") cursor = line.cursor;
        if (line.messageId !== messageId) continue;
        if (line.type === "text_delta" && line.delta) {
          reply += line.delta;
          replying.set(found.id, { bot, text: reply });
          emit(found.id, { type: "reply", bot, text: reply });
        }
        if (line.type === "turn_end") {
          failed = line.error?.message ?? "";
          break;
        }
      }
    } finally {
      fx.signal.removeEventListener("abort", stop);
      stop();
      replying.delete(found.id);
    }
    await fx.sql`update sessions set cursor = ${cursor}, seen = ${unseen.at(-1)!.id} where room = ${found.id} and bot = ${bot}`;
    if (reply.trim()) await say(found.id, bot, reply.trim());
    else if (failed) await say(found.id, "note", `${named.get(bot) ?? "A bot"} couldn't answer: ${failed}`);
  }

  // Each bot in the room answers once, in order. One taken out of the room meanwhile doesn't.
  async function round(id: number) {
    const found = await room(id);
    for (const bot of found?.members ?? []) {
      const now = await room(id);
      if (!now?.members.includes(bot)) continue;
      await answer(now, bot).catch(async (error) => {
        fx.log(`${bot} in room ${id}: ${said(error)}`);
        await say(id, "note", `${(await names()).get(bot) ?? "A bot"} couldn't answer: ${said(error)}`);
      });
    }
    emit(id, { type: "idle" });
  }

  async function members(input: unknown) {
    if (!Array.isArray(input) || input.some((bot) => typeof bot !== "string")) throw Object.assign(new Error("bots must be a list of bot ids"), { status: 400 });
    for (const bot of input) await fx.bots.get(bot);
    return [...new Set(input as string[])];
  }
  const failure = (error: unknown) => json({ error: said(error) }, (error as { status?: number }).status ?? 500);

  fx.route("GET", "/rooms", async () => {
    const rooms = await fx.sql<{ id: number; name: string }[]>`select id, name from rooms order by id`;
    return json(await Promise.all(rooms.map((r) => room(r.id))));
  });
  fx.route("POST", "/rooms", async (request) => {
    try {
      const { name, bots } = (await request.json()) as { name?: unknown; bots?: unknown };
      if (typeof name !== "string" || !name.trim() || name.trim().length > 80) return json({ error: "A room needs a name, up to 80 characters." }, 400);
      const chosen = await members(bots);
      const [made] = await fx.sql<{ id: number }[]>`insert into rooms (name) values (${name.trim()}) returning id`;
      for (const [position, bot] of chosen.entries()) await fx.sql`insert into members (room, bot, position) values (${made.id}, ${bot}, ${position})`;
      return json(await room(made.id), 201);
    } catch (error) {
      return failure(error);
    }
  });
  fx.route("PUT", "/rooms/:id/members", async (request, { id }) => {
    try {
      const found = await room(Number(id));
      if (!found) return json({ error: "No such room." }, 404);
      const chosen = await members(((await request.json()) as { bots?: unknown }).bots);
      await fx.sql.begin(async (tx) => {
        await tx`delete from members where room = ${found.id}`;
        for (const [position, bot] of chosen.entries()) await tx`insert into members (room, bot, position) values (${found.id}, ${bot}, ${position})`;
      });
      const now = await room(found.id);
      emit(found.id, { type: "room", room: now!, messages: await messages(found.id), replying: replying.get(found.id) ?? null });
      return json(now);
    } catch (error) {
      return failure(error);
    }
  });
  fx.route("DELETE", "/rooms/:id", async (_request, { id }) => {
    await fx.sql`delete from rooms where id = ${Number(id)}`;
    return json({ ok: true });
  });
  // The owner's message, saved, then a round of answers in the background.
  fx.route("POST", "/rooms/:id/messages", async (request, { id }) => {
    const found = await room(Number(id));
    if (!found) return json({ error: "No such room." }, 404);
    const { text } = (await request.json()) as { text?: unknown };
    if (typeof text !== "string" || !text.trim()) return json({ error: "text is required" }, 400);
    const message = await say(found.id, "owner", text.trim());
    const next = (rounds.get(found.id) ?? Promise.resolve()).then(() => round(found.id)).catch((error) => fx.log(`round in room ${found.id}: ${said(error)}`));
    rounds.set(found.id, next);
    return json(message, 201);
  });
  // The room as it is, then each change, as NDJSON, until the page goes.
  fx.route("GET", "/rooms/:id/stream", async (request, { id }) => {
    const found = await room(Number(id));
    if (!found) return json({ error: "No such room." }, 404);
    const encoder = new TextEncoder();
    let listen: (event: Event) => void = () => {};
    const leave = () => listeners.get(found.id)?.delete(listen);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        listen = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        if (!listeners.has(found.id)) listeners.set(found.id, new Set());
        listeners.get(found.id)!.add(listen);
        listen({ type: "room", room: found, messages: await messages(found.id), replying: replying.get(found.id) ?? null });
      },
      cancel: leave,
    });
    request.signal.addEventListener("abort", leave);
    return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  });

  return () => listeners.clear();
}
