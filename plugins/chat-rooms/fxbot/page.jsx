// The rooms in the app: a Rooms group in the sidebar, each room with its bots' avatars, + to make one, and a screen for
// each room, where the owner tags bots with @ and each reply shows as it's written. Built into page.js; see the README.
import { useEffect, useRef, useState } from "react";
import { api, client, go, ui, useBots } from "@fxbot/app";
import { Composer } from "./composer.jsx";
import { Chip, Stack } from "./faces.jsx";
import { tokens } from "./mentions.ts";

const pathOf = (room) => `/chat-rooms/rooms/${room.id}`;

// The rooms, shared by the sidebar and the screens, and read again after a change. `writing` is the bot writing in each
// room now, from the list, then from the stream of the room that's open.
let rooms = null;
const writing = new Map();
const listeners = new Set();
const tell = () => listeners.forEach((listen) => listen());
async function reload() {
  const res = await api("/rooms").catch(() => null);
  rooms = res?.ok ? await res.json() : (rooms ?? []);
  for (const room of rooms) room.writing ? writing.set(room.id, room.writing) : writing.delete(room.id);
  tell();
}
function writes(room, bot) {
  if ((writing.get(room) ?? null) === bot) return;
  bot ? writing.set(room, bot) : writing.delete(room);
  tell();
}
function useRooms() {
  const [, bump] = useState(0);
  useEffect(() => {
    const listen = () => bump((n) => n + 1);
    listeners.add(listen);
    if (rooms === null) reload();
    return () => void listeners.delete(listen);
  }, []);
  return rooms;
}

async function call(path, method, body) {
  const res = await api(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

// The bots chat rooms is on for: only they get a room's instructions and skills. Read when a dialog opens.
function useRoomBots() {
  const bots = useBots() ?? [];
  const [on, setOn] = useState(null);
  useEffect(() => {
    client.plugins.list().then(
      (list) => {
        const mine = list.find((p) => p.name === "chat-rooms");
        setOn(mine && mine.bots !== "all" ? new Set(mine.on ?? []) : null);
      },
      () => {},
    );
  }, []);
  return on ? bots.filter((bot) => on.has(bot.id)) : bots;
}

const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// Bots to pick, in the order they're picked: the first leads, and with Everyone answers, that's the order they answer in.
function BotPicker({ chosen, onChange }) {
  const bots = useRoomBots();
  const toggle = (id, on) => onChange(on ? [...chosen, id] : chosen.filter((bot) => bot !== id));
  return (
    <div className="grid gap-2">
      {bots.map((bot) => (
        <label key={bot.id} className="flex items-center gap-3 text-sm">
          <ui.Checkbox checked={chosen.includes(bot.id)} onCheckedChange={(on) => toggle(bot.id, on === true)} />
          <ui.Blob shape={bot.shape} color={bot.color} size={24} />
          <span className="min-w-0 flex-1 truncate">{bot.name}</span>
          {chosen[0] === bot.id ? (
            <span className="text-xs text-muted-foreground">Leads</span>
          ) : (
            chosen.includes(bot.id) && <span className="text-xs text-muted-foreground tabular-nums">{chosen.indexOf(bot.id) + 1}</span>
          )}
        </label>
      ))}
      {!bots.length && <p className="text-sm text-muted-foreground">No bot has chat rooms on. Make a bot, or switch chat rooms on for one in Plugins.</p>}
    </div>
  );
}

function NewRoom({ onClose }) {
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState("");
  const create = (event) => {
    event.preventDefault();
    call("/rooms", "POST", { name, bots: chosen }).then(
      (room) => (reload(), onClose(), go(pathOf(room))),
      (e) => setError(e.message),
    );
  };
  return (
    <ui.Dialog open onOpenChange={(open) => !open && onClose()}>
      <ui.DialogContent>
        <ui.DialogHeader>
          <ui.DialogTitle>New room</ui.DialogTitle>
          <ui.DialogDescription>Tag a bot with @ to ask it. The first bot you pick leads: it answers when you tag no one.</ui.DialogDescription>
        </ui.DialogHeader>
        <form onSubmit={create} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <ui.Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
          </label>
          <BotPicker chosen={chosen} onChange={setChosen} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <ui.DialogFooter>
            <ui.Button type="submit" disabled={!name.trim() || !chosen.length}>
              Make the room
            </ui.Button>
          </ui.DialogFooter>
        </form>
      </ui.DialogContent>
    </ui.Dialog>
  );
}

function RoomsGroup() {
  const list = useRooms();
  const bots = useBots() ?? [];
  const [making, setMaking] = useState(false);
  const { setOpenMobile } = ui.useSidebar();
  const open = (event, room) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpenMobile(false);
    go(pathOf(room));
  };
  const who = (room) => room.members.map((id) => bots.find((bot) => bot.id === id)?.name ?? "a bot that's gone").join(", ");
  return (
    <ui.SidebarGroup>
      <ui.SidebarGroupLabel>Rooms</ui.SidebarGroupLabel>
      <ui.SidebarGroupAction title="New room" aria-label="New room" onClick={() => setMaking(true)}>
        <Plus />
      </ui.SidebarGroupAction>
      <ui.SidebarMenu>
        {list?.map((room) => (
          <ui.SidebarMenuItem key={room.id}>
            <ui.SidebarMenuButton asChild isActive={location.pathname === pathOf(room)}>
              <a href={pathOf(room)} title={who(room)} onClick={(event) => open(event, room)}>
                <Stack ids={room.members} busy={writing.get(room.id)} />
                <span className="truncate">{room.name}</span>
              </a>
            </ui.SidebarMenuButton>
          </ui.SidebarMenuItem>
        ))}
      </ui.SidebarMenu>
      {list?.length === 0 && <p className="px-2 text-xs text-muted-foreground">Talk with several bots at once.</p>}
      {making && <NewRoom onClose={() => setMaking(false)} />}
    </ui.SidebarGroup>
  );
}

// The room's name, its bots in order, what an untagged message does, and bot replies per message, and deleting it.
function EditRoom({ room, onClose }) {
  const [name, setName] = useState(room.name);
  const [chosen, setChosen] = useState(room.members);
  const [untagged, setUntagged] = useState(room.untagged);
  const [replies, setReplies] = useState(String(room.replies));
  const [error, setError] = useState("");
  const save = (event) => {
    event.preventDefault();
    call(`/rooms/${room.id}`, "PUT", { name, bots: chosen, untagged, replies: Number(replies) }).then(() => (reload(), onClose()), (e) => setError(e.message));
  };
  const remove = () => confirm(`Delete ${room.name} and what was said in it?`) && call(`/rooms/${room.id}`, "DELETE").then(() => (reload(), onClose(), go("/")), (e) => setError(e.message));
  const option = (value, label, detail) => (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="radio" name="untagged" className="mt-1" checked={untagged === value} onChange={() => setUntagged(value)} />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
  return (
    <ui.Dialog open onOpenChange={(open) => !open && onClose()}>
      <ui.DialogContent>
        <ui.DialogHeader>
          <ui.DialogTitle>{room.name}</ui.DialogTitle>
          <ui.DialogDescription>Who's in the room, and how its bots answer.</ui.DialogDescription>
        </ui.DialogHeader>
        <form onSubmit={save} className="grid max-h-[70dvh] gap-4 overflow-y-auto">
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <ui.Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <BotPicker chosen={chosen} onChange={setChosen} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">When you tag no one</legend>
            {option("lead", "The lead answers", "The first bot answers, and can bring others in by tagging them.")}
            {option("everyone", "Everyone answers", "Every bot answers, in order.")}
          </fieldset>
          <label className="grid gap-1.5 text-sm font-medium">
            Bot replies per message
            <ui.Input type="number" min={1} max={30} value={replies} onChange={(e) => setReplies(e.target.value)} className="w-24" />
            <span className="font-normal text-muted-foreground">Bots stop tagging each other after this many replies, until you tag one.</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <ui.DialogFooter className="gap-2">
            <ui.Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
              Delete room
            </ui.Button>
            <ui.Button type="submit" disabled={!name.trim() || !chosen.length}>
              Save
            </ui.Button>
          </ui.DialogFooter>
        </form>
      </ui.DialogContent>
    </ui.Dialog>
  );
}

// The room's events, as its stream sends them: the room, then each message, the reply being written, and who's next. A
// dropped stream opens again.
function useRoom(id) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const stop = new AbortController();
    const apply = (event) => {
      // Who's writing, for the sidebar, outside the state's update.
      if (event.type === "room") writes(id, event.replying?.bot ?? null);
      if (event.type === "reply") writes(id, event.bot);
      if (event.type === "idle" || (event.type === "message" && writing.get(id) === event.message.author)) writes(id, null);
      setState((now) => {
        if (event.type === "room") return { room: event.room, messages: event.messages, replying: event.replying, queue: event.queue ?? [] };
        if (!now) return now;
        if (event.type === "message") {
          const messages = now.messages.some((m) => m.id === event.message.id) ? now.messages : [...now.messages, event.message];
          return { ...now, messages, replying: now.replying?.bot === event.message.author ? null : now.replying };
        }
        if (event.type === "reply") return { ...now, replying: { bot: event.bot, text: event.text } };
        if (event.type === "queue") return { ...now, queue: event.bots };
        if (event.type === "idle") return { ...now, replying: null, queue: [] };
        return now;
      });
    };
    (async () => {
      while (!stop.signal.aborted) {
        try {
          const res = await api(`/rooms/${id}/stream`, { signal: stop.signal });
          if (!res.ok) {
            setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
            return;
          }
          setError("");
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let rest = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const parts = (rest + decoder.decode(value, { stream: true })).split("\n");
            rest = parts.pop();
            for (const part of parts) if (part) apply(JSON.parse(part));
          }
        } catch {
          if (stop.signal.aborted) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();
    return () => stop.abort();
  }, [id]);
  return { state, error };
}

// A message's text with its mentions as chips: the owner's split on its tokens, a bot's as Markdown, whose tokens
// outside code become <mention> tags that Streamdown draws as chips.
const code = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
const tagged = (text) =>
  text
    .split(code)
    .map((part, i) => (i % 2 ? part : part.replace(tokens, (_, bot) => `<mention bot="${bot ?? "all"}"></mention>`)))
    .join("");
const chips = { mention: ({ bot }) => <Chip id={bot} /> };
function Owned({ text }) {
  const parts = text.split(/<@(?:bot:([0-9a-f]{12})|(all))>/);
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(parts[i]);
    if (i + 1 < parts.length) out.push(<Chip key={i} id={parts[i + 1] ?? "all"} />);
  }
  return out;
}
const Markdown = ({ text }) => (
  <ui.Streamdown allowedTags={{ mention: ["bot"] }} components={chips}>
    {tagged(text)}
  </ui.Streamdown>
);

function Said({ message, bot }) {
  if (message.author === "note") return <p className="text-center text-xs text-muted-foreground">{message.text}</p>;
  if (message.author === "owner")
    return (
      <div className="flex justify-end">
        <ui.Bubble align="end" variant="muted">
          <ui.BubbleContent className="whitespace-pre-wrap">
            <Owned text={message.text} />
          </ui.BubbleContent>
        </ui.Bubble>
      </div>
    );
  return (
    <div className="flex items-start gap-3">
      {bot ? <ui.Blob shape={bot.shape} color={bot.color} size={28} className="shrink-0" /> : null}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word">
        <span className="text-sm font-medium">{bot?.name ?? "A bot that's gone"}</span>
        <Markdown text={message.text} />
      </div>
    </div>
  );
}

function RoomScreen({ params }) {
  const id = Number(params.id);
  const bots = useBots() ?? [];
  const botOf = (id) => bots.find((bot) => bot.id === id);
  const { state, error } = useRoom(id);
  const [problem, setProblem] = useState("");
  const [editing, setEditing] = useState(false);
  const [empty, setEmpty] = useState(true);
  const submit = useRef(null);
  const end = useRef(null);
  // In braces: scrollIntoView returns a promise in some browsers, and an effect may return only its cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state?.messages.length, state?.replying?.text]);
  const room = state?.room;
  const members = (room?.members ?? []).map(botOf).filter(Boolean);
  const send = (text) =>
    call(`/rooms/${id}/messages`, "POST", { text }).then(
      () => setProblem(""),
      (e) => {
        setProblem(e.message);
        throw e;
      },
    );
  const stop = () => call(`/rooms/${id}/stop`, "POST").catch((e) => setProblem(e.message));
  const writer = state?.replying && botOf(state.replying.bot);
  const next = (state?.queue ?? []).map((bot) => botOf(bot)?.name ?? "a bot that's gone");
  const busy = Boolean(state?.replying || next.length);
  const lead = members[0];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ui.Header
        title={room?.name ?? "Room"}
        children={
          room && (
            <div className="flex items-center gap-1">
              {room.members.map((member) => {
                const bot = botOf(member);
                return bot ? <ui.Blob key={member} shape={bot.shape} color={bot.color} size={24} busy={state.replying?.bot === member} /> : null;
              })}
              <ui.Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </ui.Button>
            </div>
          )
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 px-4 py-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {state?.messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {room?.untagged === "everyone" || !lead ? "Tag a bot with @, or say something, and each bot answers in turn." : `Tag a bot with @, or say something, and ${lead.name} answers.`}
            </p>
          )}
          {state?.messages.map((message) => (
            <Said key={message.id} message={message} bot={botOf(message.author)} />
          ))}
          {state?.replying && (
            <div className="flex items-start gap-3" data-replying>
              {writer ? <ui.Blob shape={writer.shape} color={writer.color} size={28} busy className="shrink-0" /> : null}
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word">
                <span className="text-sm font-medium">{writer?.name ?? "A bot"}</span>
                {state.replying.text ? <Markdown text={state.replying.text} /> : <p className="animate-pulse text-muted-foreground">Thinking…</p>}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </main>
      <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {busy && (
          <div className="flex items-center justify-between gap-2 pb-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{next.length ? `Next: ${next.join(", ")}` : ""}</span>
            <ui.Button type="button" variant="outline" size="sm" onClick={stop}>
              Stop
            </ui.Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Composer bots={members} placeholder={room ? `Message ${room.name}` : "Loading…"} disabled={!room} onSend={send} submitRef={submit} onEmpty={setEmpty} />
          <ui.Button type="button" disabled={empty || !room} onClick={() => submit.current?.()}>
            Send
          </ui.Button>
        </div>
        {problem && <p className="pt-2 text-center text-sm text-destructive">{problem}</p>}
      </div>
      {editing && room && <EditRoom room={room} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function setup(app) {
  app.sidebar(RoomsGroup);
  app.route("/rooms/:id", RoomScreen);
}
