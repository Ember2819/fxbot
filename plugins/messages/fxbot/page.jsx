// The messages in the app: the Messages screen, each conversation as one thread across the bots' chats, how a send shows
// in a reply, a line in each bot's settings saying what it does, and tagging a bot with @ in the message box. Built into
// page.js; see the README.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, createPortal, go, ui, useBots } from "@fxbot/app";

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
          {named(message.text)}
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
  // A bot may name another by id, or with the owner's tag.
  const id = (/\/profiles\/([0-9a-f]{12})/i.exec(to ?? "")?.[1] ?? to ?? "").toLowerCase();
  const bot = (useBots() ?? []).find((b) => b.id === id);
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Face bot={bot} />
        To {bot?.name ?? named(to) ?? "a bot"}
      </p>
      {text && (
        <p className="whitespace-pre-wrap" style={wraps}>
          {named(text)}
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

// A tag: the box shows @Name, and it's sent as a link to that bot, which holds its id, so two Bobs can't be confused. It
// reads as a name to a bot, and in any Markdown, with or without this plugin.
const tagLink = /\[@([^\]\n]*)\]\(\/profiles\/([0-9a-f]{12})\)/g;
const named = (text) => text?.replace(tagLink, "@$1");
const safeName = (name) => name.replace(/[[\]\n]/g, "");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inBox = (text, tag) => new RegExp(`(^|\\s)${escaped(`@${tag.name}`)}(?!\\w)`).test(text);

// What the box has tagged, for app.sending, which runs outside it.
let tagged = [];

// The text with each tag as its link. Two tags of one name go in the order they were picked.
function linked(text) {
  if (!tagged.length) return text;
  const left = [...tagged];
  const names = [...new Set(left.map((tag) => tag.name))].sort((a, b) => b.length - a.length).map((name) => escaped(`@${name}`));
  return text.replace(new RegExp(`(^|\\s)(${names.join("|")})(?!\\w)`, "g"), (whole, before, shown) => {
    const at = left.findIndex((tag) => `@${tag.name}` === shown);
    if (at < 0) return whole;
    const [tag] = left.splice(at, 1);
    return `${before}[@${safeName(tag.name)}](/profiles/${tag.id})`;
  });
}

// `@` at the start of the box or after a space lists the bots this one can reach, by the start of the name first. The
// pick goes in as @Name, with the bot's face beside the box to show which one it is. The list sits above the box, and
// its keys come first: this listens on the textarea, so the app's own handler doesn't see them.
function Tags({ bot, draft, box, setDraft }) {
  const bots = useBots() ?? [];
  const [reach, setReach] = useState([]);
  const [picked, setPicked] = useState([]);
  const [token, setToken] = useState(null);
  const [active, setActive] = useState(0);
  const caret = useRef(null);
  tagged = picked;

  const load = () => void call(`/tags/${bot.id}`).then(setReach, () => {});
  useEffect(() => void (setPicked([]), setToken(null), load()), [bot.id]);
  useEffect(() => void (token && load()), [Boolean(token)]);
  useEffect(() => {
    if (!draft) setPicked([]);
    const at = box.current?.selectionStart ?? draft.length;
    const typed = /(?:^|\s)@([^\s@]*)$/.exec(draft.slice(0, at));
    setToken(typed ? { start: at - typed[1].length - 1, query: typed[1].toLowerCase() } : null);
    setActive(0);
  }, [draft]);
  useLayoutEffect(() => {
    if (caret.current === null || !box.current) return;
    box.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [draft]);

  const about = new Map(reach.map((one) => [one.id, one.about]));
  const lower = (b) => b.name.toLowerCase();
  const matches = token
    ? bots
        .filter((b) => about.has(b.id) && lower(b).includes(token.query))
        .sort((a, b) => Number(lower(b).startsWith(token.query)) - Number(lower(a).startsWith(token.query)))
        .slice(0, 8)
    : [];
  const open = matches.length > 0;

  function choose(pick) {
    const shown = `@${pick.name} `;
    setDraft(draft.slice(0, token.start) + shown + draft.slice(token.start + 1 + token.query.length).replace(/^ /, ""));
    setPicked((all) => [...all, { id: pick.id, name: pick.name }]);
    setToken(null);
    caret.current = token.start + shown.length;
  }

  useEffect(() => {
    const el = box.current;
    if (!el || !open) return;
    const keys = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
      else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) choose(matches[active]);
      else if (e.key === "Escape") setToken(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const blur = () => setToken(null);
    el.addEventListener("keydown", keys);
    el.addEventListener("blur", blur);
    el.setAttribute("aria-expanded", "true");
    el.setAttribute("aria-controls", "tag-picker");
    el.setAttribute("aria-activedescendant", `tag-option-${active}`);
    return () => {
      el.removeEventListener("keydown", keys);
      el.removeEventListener("blur", blur);
      el.setAttribute("aria-expanded", "false");
      el.setAttribute("aria-controls", "skill-picker");
      el.removeAttribute("aria-activedescendant");
    };
  });

  const form = box.current?.closest("form");
  return (
    <>
      {picked
        .filter((tag) => inBox(draft, tag))
        .map((tag, i) => {
          const face = bots.find((b) => b.id === tag.id);
          return face ? (
            <span key={i} title={`@${tag.name}`} aria-label={`Tagged ${tag.name}`} style={{ display: "inline-flex" }}>
              <ui.Blob shape={face.shape} color={face.color} size={18} />
            </span>
          ) : null;
        })}
      {open &&
        form &&
        createPortal(
          <div id="tag-picker" role="listbox" aria-label="Bots" className="absolute right-4 bottom-full left-4 z-10 mb-2 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md">
            {matches.map((b, i) => (
              <button
                key={b.id}
                id={`tag-option-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                // Keeps the box focused, so the pick lands where the caret was.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(b)}
                className={`flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${i === active ? "bg-accent text-accent-foreground" : ""}`}
              >
                <ui.Blob shape={b.shape} color={b.color} size={20} />
                <span className="grid min-w-0 flex-1">
                  <span className="font-medium">{b.name}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{about.get(b.id) || b.id}</span>
                </span>
              </button>
            ))}
          </div>,
          form,
        )}
    </>
  );
}

// A tag in a sent message: the bot's face and its name now, or the name it had, if it's gone.
function Tag({ match }) {
  const bot = (useBots() ?? []).find((b) => b.id === match[2]);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 6px 0 3px", borderRadius: 9999, background: "rgb(255 255 255 / 0.2)", fontWeight: 500, verticalAlign: "bottom" }}>
      {bot && <ui.Blob shape={bot.shape} color={bot.color} size={16} />}@{bot?.name ?? match[1]}
    </span>
  );
}

export default function setup(app) {
  app.composer(Tags);
  app.sending(linked);
  app.said(tagLink, Tag);
  app.nav({ label: "Messages", path: "/" });
  app.route("/", Screen);
  app.toolView("send", Sent, { open: true });
  app.botSettings(About);
}
