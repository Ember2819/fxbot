// Permissions in the app: the card above a bot's message box, a shield in the box for its mode, Waiting on you in the
// sidebar, a section in each bot's settings, and the reviewer in this plugin's tab. Built into page.js; see the README.
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, client, go, ui, useBots } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

// The cards, shared by every place that shows them. Read often while a bot works or a card is open, and at once when one
// starts, or a card would wait for the slow read. Only the newest read goes on to schedule the next.
let asks = [];
let busy = false;
let timer = null;
let reads = 0;
const listeners = new Set();
const tell = () => listeners.forEach((listen) => listen());
async function read() {
  clearTimeout(timer);
  const mine = ++reads;
  if (document.visibilityState === "visible") {
    const next = await call("asks").catch(() => null);
    if (next && mine === reads) (asks = next), tell();
  }
  if (mine !== reads) return;
  timer = listeners.size ? setTimeout(read, busy || asks.some((ask) => ask.state === "open") ? 3000 : 15000) : null;
}
const subscribe = (listen) => {
  listeners.add(listen);
  if (!timer) void read();
  return () => void listeners.delete(listen);
};
function useAsks() {
  const working = Boolean(useBots()?.some((bot) => bot.busy));
  useEffect(() => {
    const started = working && !busy;
    busy = working;
    if (started) void read();
  }, [working]);
  return useSyncExternalStore(subscribe, () => asks);
}
const answer = (ask, body) => call(`asks/${ask.id}`, "POST", body).then((result) => (void read(), result));

const fold = 600;
const shown = (input) => (typeof input?.command === "string" && Object.keys(input).length <= 2 ? input.command : JSON.stringify(input, null, 2));
const left = (at) => Math.max(1, Math.ceil((new Date(at).getTime() - Date.now()) / 60000));

// The exact action, folded when long, and never summarized.
function Action({ input }) {
  const [open, setOpen] = useState(false);
  const text = shown(input);
  const long = text.length > fold;
  return (
    <div className="grid gap-1">
      <pre className="rounded-md bg-muted px-2 py-1.5 text-xs whitespace-pre-wrap" style={{ overflowWrap: "anywhere", margin: 0 }}>
        {long && !open ? `${text.slice(0, fold)}…` : text}
      </pre>
      {long && (
        <ui.Button type="button" size="xs" variant="ghost" className="justify-self-start" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show all"}
        </ui.Button>
      )}
    </div>
  );
}

function Card({ ask, name }) {
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const send = (body) => {
    setError("");
    setSent(true);
    answer(ask, body).catch((e) => (setError(e.message), setSent(false)));
  };
  const always = ask.exact ? "Always allow this" : `Always allow ${ask.tool}`;
  const expired = ask.state === "expired";
  return (
    <section className="grid gap-2 rounded-lg border bg-background p-3 text-sm" aria-label={`${name} wants to use ${ask.tool}`}>
      <p className="font-medium" style={{ overflowWrap: "anywhere" }}>
        {name} wants to use {ask.tool}
      </p>
      <Action input={ask.input} />
      {ask.reason && <p>{ask.reason}</p>}
      {expired ? (
        <p className="text-muted-foreground">Expired. {name} didn't do this.</p>
      ) : (
        ask.background && ask.expiresAt && <p className="text-muted-foreground">You didn't start this. It expires in {left(ask.expiresAt)} {left(ask.expiresAt) === 1 ? "minute" : "minutes"}.</p>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {denying ? (
        <div className="flex flex-wrap gap-2">
          <ui.Input aria-label="Say why, if you like" placeholder="Say why, if you like" value={note} maxLength={500} className="flex-1" style={{ minWidth: "10rem" }} onChange={(e) => setNote(e.target.value)} />
          <ui.Button type="button" size="sm" variant="destructive" disabled={sent} onClick={() => send({ answer: "deny", note })}>
            Deny
          </ui.Button>
          <ui.Button type="button" size="sm" variant="ghost" onClick={() => setDenying(false)}>
            Back
          </ui.Button>
        </div>
      ) : expired ? (
        <div className="flex flex-wrap gap-2">
          <ui.Button type="button" size="sm" variant="outline" disabled={sent} onClick={() => send({ answer: "always" })}>
            {always}
          </ui.Button>
          <ui.Button type="button" size="sm" variant="ghost" disabled={sent} onClick={() => send({ answer: "dismiss" })}>
            Dismiss
          </ui.Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <ui.Button type="button" size="sm" disabled={sent} onClick={() => send({ answer: "once" })}>
            Approve once
          </ui.Button>
          <ui.Button type="button" size="sm" variant="outline" disabled={sent} onClick={() => send({ answer: "always" })}>
            {always}
          </ui.Button>
          <ui.Button type="button" size="sm" variant="ghost" disabled={sent} onClick={() => setDenying(true)}>
            Deny
          </ui.Button>
        </div>
      )}
    </section>
  );
}

// Every card of this bot, whichever session raised it.
function Cards({ bot }) {
  const mine = useAsks().filter((ask) => ask.bot === bot.id);
  return mine.map((ask) => <Card key={ask.id} ask={ask} name={bot.name} />);
}

// In a room's header: a count, since the header is one row, which opens the room's bots' cards.
function RoomCards({ room }) {
  const bots = useBots() ?? [];
  const [open, setOpen] = useState(false);
  const mine = useAsks().filter((ask) => ask.state === "open" && room.members?.includes(ask.bot));
  if (!mine.length) return null;
  return (
    <>
      <ui.Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {mine.length} waiting on you
      </ui.Button>
      <ui.Dialog open={open} onOpenChange={setOpen}>
        <ui.DialogContent className="overflow-y-auto" style={{ maxHeight: "85dvh" }}>
          <ui.DialogHeader>
            <ui.DialogTitle>Waiting on you</ui.DialogTitle>
          </ui.DialogHeader>
          {mine.map((ask) => (
            <Card key={ask.id} ask={ask} name={bots.find((bot) => bot.id === ask.bot)?.name ?? "A bot"} />
          ))}
        </ui.DialogContent>
      </ui.Dialog>
    </>
  );
}

// Shows only with a card open, which is how one reaches an owner somewhere else in the app.
function Waiting() {
  const bots = useBots() ?? [];
  const open = useAsks().filter((ask) => ask.state === "open");
  if (!open.length) return null;
  return (
    <ui.SidebarGroup>
      <ui.SidebarGroupLabel>Waiting on you</ui.SidebarGroupLabel>
      <ui.SidebarMenu>
        {open.map((ask) => {
          const bot = bots.find((one) => one.id === ask.bot);
          return (
            <ui.SidebarMenuItem key={ask.id}>
              <ui.SidebarMenuButton onClick={() => go(`/profiles/${ask.bot}`)}>
                {bot && <ui.Blob {...bot} size={20} />}
                <span className="truncate">
                  {bot?.name ?? "A bot"}: {ask.tool}
                </span>
              </ui.SidebarMenuButton>
            </ui.SidebarMenuItem>
          );
        })}
      </ui.SidebarMenu>
    </ui.SidebarGroup>
  );
}

const modes = [
  ["ask", "Ask", "Asks you before anything but a safe tool."],
  ["auto", "Auto", "A reviewer model checks risky calls against what you said, and asks you when it's unsure."],
  ["yolo", "Yolo", "Runs everything, with no checks."],
];

function Modes({ mode, onPick }) {
  return (
    <div className="grid gap-1.5" role="radiogroup" aria-label="Permission mode">
      {modes.map(([value, label, about]) => (
        <ui.Button key={value} type="button" role="radio" aria-checked={mode === value} variant={mode === value ? "default" : "outline"} className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onPick(value)}>
          <span>
            <strong>{label}.</strong> {about}
          </span>
        </ui.Button>
      ))}
    </div>
  );
}

const Shield = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// Beside the message box: the bot's mode, which can change in the middle of a chat.
function ModeButton({ bot }) {
  const [mode, setMode] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => void call(`bots/${bot.id}`).then((data) => setMode(data.mode), () => {}), [bot.id, open]);
  if (!mode) return null;
  const pick = (next) => call(`bots/${bot.id}`, "PUT", { mode: next }).then(() => (setMode(next), setOpen(false), void read()), (e) => setError(e.message));
  return (
    <>
      <ui.Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label={`Permissions: ${mode}`} title={`Permissions: ${mode}`} onClick={() => setOpen(true)}>
        <Shield />
      </ui.Button>
      <ui.Dialog open={open} onOpenChange={setOpen}>
        <ui.DialogContent>
          <ui.DialogHeader>
            <ui.DialogTitle>What {bot.name} can do alone</ui.DialogTitle>
          </ui.DialogHeader>
          <Modes mode={mode} onPick={pick} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </ui.DialogContent>
      </ui.Dialog>
    </>
  );
}

const outcome = { open: "Waiting", allowed: "Allowed", denied: "Denied", expired: "Expired", closed: "Closed" };

function Section({ bot }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = () => call(`bots/${bot.id}`).then(setData, (e) => setError(e.message));
  useEffect(() => void load(), [bot.id]);
  if (!data) return null;
  return (
    <section className="grid gap-3 text-sm" aria-label="Permissions">
      <h2 className="font-medium">Permissions</h2>
      <Modes mode={data.mode} onPick={(mode) => call(`bots/${bot.id}`, "PUT", { mode }).then(load, (e) => setError(e.message))} />
      {data.rules.length > 0 && (
        <ul className="grid gap-1.5">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
                {rule.tool}
                {rule.input ? `: ${rule.input}` : ""}
              </span>
              <ui.Button type="button" size="xs" variant="ghost" onClick={() => call(`rules/${rule.id}`, "DELETE").then(load, (e) => setError(e.message))}>
                Remove
              </ui.Button>
            </li>
          ))}
        </ul>
      )}
      {data.cards.length > 0 && (
        <ul className="grid gap-1 text-muted-foreground">
          {data.cards.map((ask) => (
            <li key={ask.id} className="flex gap-3">
              <span className="min-w-0 flex-1 truncate">{ask.tool}</span>
              <span>{outcome[ask.state]}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </section>
  );
}

// One choice for every bot: each bot's own model, or a provider and model picked here.
function Reviewer() {
  const [picked, setPicked] = useState(null);
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void call("reviewer").then(setPicked, (e) => setError(e.message));
    void client.providers.list().then(setProviders, () => {});
  }, []);
  if (!picked) return null;
  // A pick saves at once. Save settings below is for the plugin's text boxes.
  const save = (next) => {
    setPicked(next);
    setSaved(false);
    setError("");
    if (!next.provider || next.model) void call("reviewer", "PUT", next).then(() => setSaved(true), (e) => setError(e.message));
  };
  const gone = picked.provider && providers.length > 0 && !providers.some((p) => p.id === picked.provider);
  return (
    <section className="grid gap-2 text-sm" aria-label="Reviewer">
      <h2 className="font-medium">Reviewer</h2>
      <p className="text-muted-foreground">The model that checks a risky call in auto, for every bot.</p>
      <ui.NativeSelect aria-label="Reviewer's provider" className="w-full" value={gone ? "" : picked.provider} onChange={(e) => save({ provider: e.target.value, model: "" })}>
        <ui.NativeSelectOption value="">The bot's own model</ui.NativeSelectOption>
        {providers.map((p) => (
          <ui.NativeSelectOption key={p.id} value={p.id}>
            {p.name}
          </ui.NativeSelectOption>
        ))}
      </ui.NativeSelect>
      {picked.provider && !gone && <ui.ModelField id="reviewer" provider={picked.provider} value={picked.model} onChange={(model) => save({ ...picked, model })} placeholder="Pick a model" />}
      {saved && <p className="text-muted-foreground">Saved. The next review uses this.</p>}
      {picked.provider && !gone && !picked.model && <p className="text-muted-foreground">Pick a model to save this.</p>}
      {gone && <p className="text-destructive">That provider is gone, so reviews fail and every risky call asks you. Pick another.</p>}
      {error && <p className="text-destructive">{error}</p>}
    </section>
  );
}

export default function setup(app) {
  app.chat(Cards);
  app.composer(ModeButton);
  app.sidebar(Waiting);
  app.botSettings(Section);
  app.settings(Reviewer);
  app.slot("chat-rooms.room-header", RoomCards);
}
