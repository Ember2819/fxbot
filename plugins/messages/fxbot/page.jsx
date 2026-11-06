// The messages in the app: the Messages screen, each conversation as one thread across the bots' chats, how a send shows
// in a reply, and a line in each bot's settings saying what it does. Built into page.js; see the README.
import { useEffect, useState } from "react";
import { api, go, ui, useBots } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

const today = (at) => new Date(at).toDateString() === new Date().toDateString();
const when = (at) => (today(at) ? "Today " : `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} `) + new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const live = (message) => message.state === "waiting" || message.state === "working";
const outcome = (message) =>
  ({
    waiting: "Waiting",
    working: "Working…",
    failed: message.error || "Failed",
    stopped: "Stopped",
    done: message.answered ? "Answered" : "Read",
  })[message.state];

// Plugin pages get only the classes the app itself uses, so what it doesn't is written out.
const column = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)" };
const wraps = { overflowWrap: "anywhere" };

function Face({ bot }) {
  return bot ? <ui.Blob shape={bot.shape} color={bot.color} size={20} /> : null;
}

function Row({ message, bots }) {
  const from = bots.find((bot) => bot.id === message.from);
  const to = bots.find((bot) => bot.id === message.to);
  const open = () => to && go(`/profiles/${to.id}`);
  return (
    <li>
      <button type="button" className="w-full gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted" style={column} onClick={open}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Face bot={from} />
          <span className="font-medium">{from?.name ?? "A bot that's gone"}</span>
          <span className="text-muted-foreground">→</span>
          <Face bot={to} />
          <span className="font-medium">{to?.name ?? "A bot that's gone"}</span>
          <span className="ml-auto text-muted-foreground">{outcome(message)}</span>
        </span>
        <span className="whitespace-pre-wrap" style={wraps}>
          {message.text}
        </span>
        {message.files.length > 0 && (
          <span className="text-muted-foreground" style={wraps}>
            {message.files.map((file) => file.name).join(", ")}
          </span>
        )}
      </button>
    </li>
  );
}

function Thread({ conversation, most, bots, onStop }) {
  const count = conversation.messages.length;
  return (
    <section className="gap-1" style={column} aria-label={`Conversation ${conversation.id}`}>
      <div className="flex items-center gap-3 px-2">
        <p className="min-w-0 flex-1 text-muted-foreground">
          {when(conversation.at)} · {count} of {most}
          {conversation.stopped ? " · stopped" : ""}
        </p>
        {!conversation.stopped && conversation.messages.some(live) && (
          <ui.Button type="button" size="xs" variant="outline" onClick={() => onStop(conversation)}>
            Stop
          </ui.Button>
        )}
      </div>
      <ul className="gap-1" style={column}>
        {conversation.messages.map((message) => (
          <Row key={message.id} message={message} bots={bots} />
        ))}
      </ul>
    </section>
  );
}

function Screen() {
  const bots = useBots() ?? [];
  const [data, setData] = useState(null);
  const [earlier, setEarlier] = useState([]);
  const [more, setMore] = useState(null);
  const [error, setError] = useState("");
  const load = () => call("conversations").then(setData, (e) => setError(e.message));
  useEffect(() => void load(), []);
  // While a message is out, the screen follows it.
  const going = data?.conversations.some((conversation) => conversation.messages.some(live));
  useEffect(() => {
    if (!going) return;
    const again = setTimeout(load, 5000);
    return () => clearTimeout(again);
  }, [data]);
  const shown = [...(data?.conversations ?? []), ...earlier];
  const older = async () => {
    const page = await call(`conversations?before=${shown.at(-1).id}`);
    setEarlier((all) => [...all, ...page.conversations]);
    setMore(page.older);
  };
  const stop = (conversation) => call(`conversations/${conversation.id}/stop`, "POST").then(load, (e) => setError(e.message));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ui.Header title="Messages" />
      <div className="w-full gap-6 px-4 pb-6 text-sm" style={{ ...column, maxWidth: "42rem", marginInline: "auto" }}>
        <p className="text-muted-foreground">
          {bots.length < 2
            ? "With two bots or more, they message each other here to get work done, and you can watch it. Make another bot to start."
            : "Your bots talking to each other. Each message is in both bots' chats."}
        </p>
        {data && !shown.length && bots.length > 1 && <p className="text-muted-foreground">Nothing yet. Ask a bot to ask another.</p>}
        {shown.map((conversation) => (
          <Thread key={conversation.id} conversation={conversation} most={data.most} bots={bots} onStop={stop} />
        ))}
        {(more ?? data?.older) && (
          <ui.Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => older().catch((e) => setError(e.message))}>
            Older
          </ui.Button>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// messages_send in a reply: who it went to, the words, and how it went.
function Sent({ call: tool }) {
  const { to, text } = tool.input ?? {};
  const out = tool.done && tool.output && !/^Sent to /.test(tool.output);
  return (
    <div className="grid gap-1 text-sm">
      <p className="font-medium">To {to ?? "a bot"}</p>
      {text && (
        <p className="whitespace-pre-wrap" style={wraps}>
          {text}
        </p>
      )}
      <p className={out ? "text-destructive" : "text-muted-foreground"}>{tool.done ? tool.output : "Sending…"}</p>
    </div>
  );
}

// What this bot does, in other bots' lists of who they can message.
function About({ bot }) {
  const [about, setAbout] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => void call(`bots/${bot.id}`).then(({ about }) => (setAbout(about), setSaved(about)), (e) => setError(e.message)), [bot.id]);
  if (about === null) return null;
  const save = () => {
    if (about.trim() === saved) return;
    setError("");
    call(`bots/${bot.id}`, "PUT", { about }).then(({ about }) => (setAbout(about), setSaved(about)), (e) => setError(e.message));
  };
  return (
    <section className="grid gap-2 text-sm" aria-label="Messages">
      <h2 className="font-medium">Messages</h2>
      <label className="grid gap-1.5">
        <span className="text-muted-foreground">What this bot does, for your other bots</span>
        <ui.Input value={about} maxLength={120} onChange={(e) => setAbout(e.target.value)} onBlur={save} />
      </label>
      {error && <p className="text-destructive">{error}</p>}
    </section>
  );
}

export default function setup(app) {
  app.nav({ label: "Messages", path: "/" });
  app.route("/", Screen);
  app.toolView("send", Sent, { open: true });
  app.botSettings(About);
}
