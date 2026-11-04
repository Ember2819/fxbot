import { randomBytes } from "node:crypto";
import type { PluginApi } from "@fxbot/sdk";

// A computer for a chat room. The computer plugin asks this one which computer each call uses (computerFor), and a room
// session whose room has its computer on gets the room's: one machine its bots share, taking turns, as the room runs
// one turn at a time. Chat rooms says which room a session is for (roomOf). A room's key is `room-` and 8 random hex
// characters, made when it's first turned on and kept, so turning it off and on again finds the same home.

type Room = { id: number; name: string; members: string[] };
type Rooms = { roomOf(session: string): Promise<Room | null>; rooms(): Promise<Room[]> };

export default async function setup(fx: PluginApi) {
  if (typeof fx.need !== "function" || typeof fx.provide !== "function") throw new Error("chat-rooms-computer needs fxbot 0.5.0 or newer.");
  const rooms = () => fx.need<Rooms>("chat-rooms");
  // The room sessions this plugin's instructions reached this turn: a bot it's off for gets no hook, and keeps its own
  // computer. The sessions the skill went with, since this start.
  const reached = new Set<string>();
  const taught = new Set<string>();

  // The room a session is for, and its computer, when the room has its computer on.
  async function roomComputer(session: string) {
    const room = await rooms()?.roomOf(session);
    if (!room) return null;
    const [row] = await fx.sql<{ key: string; enabled: boolean }[]>`select key, enabled from computers where room = ${room.id}`;
    return row?.enabled ? { room, key: row.key } : null;
  }

  fx.provide({
    async computerFor({ session }: { bot: string; session: string }) {
      if (!reached.has(session)) return null;
      const found = await roomComputer(session);
      return found && { key: found.key, name: found.room.name };
    },
    // Every room's computer, on or off, so its home stays; a deleted room's goes on the computer's next sweep.
    async computers() {
      const all = await rooms()?.rooms();
      if (!all) return null;
      const byId = new Map(all.map((room) => [room.id, room]));
      return (await fx.sql<{ room: number; key: string }[]>`select room, key from computers`).flatMap((row) => (byId.has(row.room) ? [{ key: row.key, name: byId.get(row.room)!.name }] : []));
    },
  });

  // A room turn's instructions say the computer is shared, and with whom.
  fx.on("instructions", async (event) => {
    const found = await roomComputer(event.session);
    if (!found) return void reached.delete(event.session);
    reached.add(event.session);
    const names = new Map((await fx.bots.list()).map((bot) => [bot.id, bot.name]));
    const others = found.room.members.filter((bot) => bot !== event.bot).map((bot) => names.get(bot) ?? "another bot");
    const withWhom = others.length ? `which you share with ${others.slice(0, -1).join(", ")}${others.length > 1 ? " and " : ""}${others.at(-1)}, taking turns` : "used in turns";
    event.instructions.push(
      `This room has a computer of its own, ${withWhom}: during your turns here, your computer tools reach it, not your own. ` +
        "Someone may have changed it since your last turn, so look before you act. Your skill room-computer says how to share it.",
    );
  });
  // The skill goes with a bot's first room turn after the computer is on, as chat rooms sends its own.
  fx.on("message", async (event) => {
    if (event.from !== "chat-rooms" || taught.has(event.session) || !(await roomComputer(event.session))) return;
    taught.add(event.session);
    event.text = `$room-computer ${event.text}`;
  });

  const state = async (id: number) => {
    const [row] = await fx.sql<{ key: string; enabled: boolean }[]>`select key, enabled from computers where room = ${id}`;
    return { on: Boolean(row?.enabled), key: row?.key ?? null };
  };
  const roomBy = async (id: string) => {
    const all = await rooms()?.rooms();
    return all?.find((room) => room.id === Number(id)) ?? null;
  };
  fx.route("GET", "/rooms/:id", async (_request, { id }) => ((await roomBy(id)) ? Response.json(await state(Number(id))) : Response.json({ error: "No such room." }, { status: 404 })));
  // { on } turns the room's computer on or off. The key is made the first time it's turned on.
  fx.route("PUT", "/rooms/:id", async (request, { id }) => {
    const room = await roomBy(id);
    if (!room) return Response.json({ error: "No such room." }, { status: 404 });
    const { on } = (await request.json().catch(() => ({}))) as { on?: unknown };
    if (typeof on !== "boolean") return Response.json({ error: "on must be true or false" }, { status: 400 });
    const key = `room-${randomBytes(4).toString("hex")}`;
    await fx.sql`insert into computers (room, key, enabled) values (${room.id}, ${key}, ${on}) on conflict (room) do update set enabled = ${on}`;
    if (!on) for (const session of reached) if ((await rooms()?.roomOf(session))?.id === room.id) reached.delete(session);
    return Response.json(await state(room.id));
  });
}
