// The rooms in the app: a Rooms group in the sidebar, with + to make one, and a screen for each room, where the
// owner writes and each bot's reply shows as it's written. Built into page.js; see the README.
import { useEffect, useRef, useState } from "react";
import { api, go, ui, useBots } from "@fxbot/app";

const pathOf = (room) => `/chat-rooms/rooms/${room.id}`;

// The rooms, shared by the sidebar and the screens, and read again after a change.
let rooms = null;
const listeners = new Set();
async function reload() {
  const res = await api("/rooms").catch(() => null);
  rooms = res?.ok ? await res.json() : (rooms ?? []);
  listeners.forEach((listen) => listen());
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

const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// Bots to pick, in the order they're picked: that's the order they answer in.
function BotPicker({ chosen, onChange }) {
  const bots = useBots() ?? [];
  const toggle = (id, on) => onChange(on ? [...chosen, id] : chosen.filter((bot) => bot !== id));
  return (
    <div className="grid gap-2">
      {bots.map((bot) => (
        <label key={bot.id} className="flex items-center gap-3 text-sm">
          <ui.Checkbox checked={chosen.includes(bot.id)} onCheckedChange={(on) => toggle(bot.id, on === true)} />
          <ui.Blob shape={bot.shape} color={bot.color} size={24} />
          <span className="min-w-0 flex-1 truncate">{bot.name}</span>
          {chosen.includes(bot.id) && <span className="text-xs text-muted-foreground tabular-nums">{chosen.indexOf(bot.id) + 1}</span>}
        </label>
      ))}
      {!bots.length && <p className="text-sm text-muted-foreground">Make a bot first.</p>}
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
          <ui.DialogDescription>Bots answer each of your messages once, in the order you pick them.</ui.DialogDescription>
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
  const [making, setMaking] = useState(false);
  const { setOpenMobile } = ui.useSidebar();
  const open = (event, room) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpenMobile(false);
    go(pathOf(room));
  };
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
              <a href={pathOf(room)} onClick={(event) => open(event, room)}>
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

function EditRoom({ room, onClose }) {
  const [chosen, setChosen] = useState(room.members);
  const [error, setError] = useState("");
  const save = () => call(`/rooms/${room.id}/members`, "PUT", { bots: chosen }).then(() => (reload(), onClose()), (e) => setError(e.message));
  const remove = () => confirm(`Delete ${room.name} and what was said in it?`) && call(`/rooms/${room.id}`, "DELETE").then(() => (reload(), onClose(), go("/")), (e) => setError(e.message));
  return (
    <ui.Dialog open onOpenChange={(open) => !open && onClose()}>
      <ui.DialogContent>
        <ui.DialogHeader>
          <ui.DialogTitle>{room.name}</ui.DialogTitle>
          <ui.DialogDescription>Who's in the room, in the order they answer.</ui.DialogDescription>
        </ui.DialogHeader>
        <BotPicker chosen={chosen} onChange={setChosen} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ui.DialogFooter className="gap-2">
          <ui.Button variant="ghost" className="text-destructive" onClick={remove}>
            Delete room
          </ui.Button>
          <ui.Button onClick={save}>Save</ui.Button>
        </ui.DialogFooter>
      </ui.DialogContent>
    </ui.Dialog>
  );
}

// The room's events, as its stream sends them: the room, then each message and the reply being written. A dropped
// stream opens again.
function useRoom(id) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const stop = new AbortController();
    const apply = (event) =>
      setState((now) => {
        if (event.type === "room") return { room: event.room, messages: event.messages, replying: event.replying };
        if (!now) return now;
        if (event.type === "message") {
          const messages = now.messages.some((m) => m.id === event.message.id) ? now.messages : [...now.messages, event.message];
          return { ...now, messages, replying: now.replying?.bot === event.message.author ? null : now.replying };
        }
        if (event.type === "reply") return { ...now, replying: { bot: event.bot, text: event.text } };
        if (event.type === "idle") return { ...now, replying: null };
        return now;
      });
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

function Said({ message, bot }) {
  if (message.author === "note") return <p className="text-center text-xs text-muted-foreground">{message.text}</p>;
  if (message.author === "owner")
    return (
      <div className="flex justify-end">
        <ui.Bubble align="end" variant="muted">
          <ui.BubbleContent className="whitespace-pre-wrap">{message.text}</ui.BubbleContent>
        </ui.Bubble>
      </div>
    );
  return (
    <div className="flex items-start gap-3">
      {bot ? <ui.Blob shape={bot.shape} color={bot.color} size={28} className="shrink-0" /> : null}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word">
        <span className="text-sm font-medium">{bot?.name ?? "A bot that's gone"}</span>
        <ui.Streamdown>{message.text}</ui.Streamdown>
      </div>
    </div>
  );
}

function RoomScreen({ params }) {
  const id = Number(params.id);
  const bots = useBots() ?? [];
  const botOf = (id) => bots.find((bot) => bot.id === id);
  const { state, error } = useRoom(id);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const [editing, setEditing] = useState(false);
  const end = useRef(null);
  // In braces: scrollIntoView returns a promise in some browsers, and an effect may return only its cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state?.messages.length, state?.replying?.text]);
  const send = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    call(`/rooms/${id}/messages`, "POST", { text }).then(() => setProblem(""), (e) => (setProblem(e.message), setDraft(text)));
  };
  const room = state?.room;
  const writer = state?.replying && botOf(state.replying.bot);
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
          {state?.messages.length === 0 && <p className="text-center text-sm text-muted-foreground">Say something, and each bot here answers in turn.</p>}
          {state?.messages.map((message) => (
            <Said key={message.id} message={message} bot={botOf(message.author)} />
          ))}
          {state?.replying && (
            <div className="flex items-start gap-3" data-replying>
              {writer ? <ui.Blob shape={writer.shape} color={writer.color} size={28} busy className="shrink-0" /> : null}
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word">
                <span className="text-sm font-medium">{writer?.name ?? "A bot"}</span>
                {state.replying.text ? <ui.Streamdown>{state.replying.text}</ui.Streamdown> : <p className="animate-pulse text-muted-foreground">Thinking…</p>}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </main>
      <form onSubmit={send} className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ui.Textarea
          aria-label="Message the room"
          rows={1}
          className="max-h-48 min-h-10 flex-1 resize-none rounded-2xl"
          placeholder={room ? `Message ${room.name}` : "Loading…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && send(e)}
        />
        <ui.Button type="submit" disabled={!draft.trim()}>
          Send
        </ui.Button>
      </form>
      {problem && <p className="px-4 pb-2 text-center text-sm text-destructive">{problem}</p>}
      {editing && room && <EditRoom room={room} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function setup(app) {
  app.sidebar(RoomsGroup);
  app.route("/rooms/:id", RoomScreen);
}
