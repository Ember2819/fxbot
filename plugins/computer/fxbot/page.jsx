// The computer in the app:
// - a Computer screen for each computer, at /computer/computers/:key, and a bot's at /computer/bots/:id too, with its
//   desktop and its terminal, live, Take over, and an arrow where each bot last pointed
// - a Settings section with the engine, the image, and each bot's computer, and a section in each bot's settings
// - a view of computer_desktop's calls in a reply, with the screenshot each one returned
// - a Computer button beside the message box, which adds $computer to the message
// - the computer's screen, small, in each bot's panel
// Built into page.js, and noVNC into novnc.js, which the plugin serves; see the README.
import { useEffect, useRef, useState } from "react";
import { api, client, go, ui, useBots } from "@fxbot/app";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

// Whether the machine is setting the engine up.
const settingUp = (status) => ["asked", "working"].includes(status?.setup?.state) && status.engine.state !== "ready";

// The plugin's status, read again every 2 seconds while the image builds or the engine is set up. A setup in a release
// install starts fxbot again, so a read that fails then doesn't stop the next.
function useStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const load = () => call("status").then((next) => (setStatus(next), setError("")), (e) => setError(e.message));
  useEffect(() => void load(), []);
  const waiting = Boolean(status?.building) || settingUp(status);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [waiting]);
  const act = (path, method = "POST") => call(path, method).then(setStatus, (e) => setError(e.message));
  return { status, error, act };
}

// One computer, by its key, a bot's id or a key another plugin names: its name, whether it runs, who has it, and how many
// watch. Read again every `every` ms while the page is on screen. No key, no reads.
function useComputer(key, every) {
  const [state, setState] = useState(null);
  const load = () => (key ? call(`computers/${key}/state`).then(setState, () => {}) : Promise.resolve());
  useEffect(() => {
    void load();
    if (!key) return;
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), every);
    return () => clearInterval(timer);
  }, [key, every]);
  return [state, load];
}

const size = (n) => (n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.ceil(n / 1e3)} kB`);
const ago = (at) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};
const Code = ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">{children}</pre>;
const screenOf = (key) => `/computer/computers/${key}`;
const socketOf = (kind, key) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/plugins/computer/${kind}/${key}`;
// The bots' colours, as the app draws them, for the arrows.
const colors = { black: "#1f1f1f", brown: "#9b6a3f", red: "#e5484d", orange: "#f06b2b", amber: "#ec9a2e", green: "#56bf73", teal: "#4fb3a2", blue: "#3b82f6", purple: "#8b5cf6", pink: "#e64ba0", gray: "#9a9a9a" };
const since = (at) => {
  const s = Math.round((Date.now() - at) / 1000);
  return s < 60 ? `${Math.max(1, s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
};
const pill = { background: "rgba(20,20,20,.82)", color: "#fff", fontSize: 11, lineHeight: "16px", padding: "1px 6px", borderRadius: 8, whiteSpace: "nowrap" };

// An arrow where each bot last pointed, over the desktop, mapped as noVNC fits and centres the screen in the same box.
// The newest is solid and the others faded; a bot that last used the browser or an app's tree, which move no pointer,
// shows as a pill at the top left. Read once a second while it shows and the page is on screen. Clicks go through it.
function Cursors({ computer, hidden }) {
  const box = useRef(null);
  const [data, setData] = useState(null);
  const [size, setSize] = useState(null);
  const bots = useBots();
  useEffect(() => {
    if (hidden) return;
    let stopped = false;
    const read = () => document.visibilityState === "visible" && call(`computers/${computer}/cursors`).then((next) => !stopped && setData(next), () => {});
    read();
    const timer = setInterval(read, 1000);
    return () => ((stopped = true), clearInterval(timer));
  }, [computer, hidden]);
  useEffect(() => {
    const watch = new ResizeObserver(() => box.current && setSize([box.current.clientWidth, box.current.clientHeight]));
    watch.observe(box.current);
    return () => watch.disconnect();
  }, []);
  const marks = data?.marks ?? [];
  const newest = Math.max(0, ...marks.map((m) => m.at));
  const botOf = (id) => bots?.find((b) => b.id === id);
  const [w, h] = data?.screen ?? [1, 1];
  const scale = size ? Math.min(size[0] / w, size[1] / h) : 0;
  return (
    <div ref={box} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {size &&
        marks
          .filter((m) => m.x !== undefined && m.x !== null)
          .map((m) => (
            <div
              key={m.bot}
              data-bot={m.bot}
              style={{ position: "absolute", left: (size[0] - w * scale) / 2 + m.x * scale - 1, top: (size[1] - h * scale) / 2 + m.y * scale - 1, opacity: m.at === newest ? 1 : 0.45, display: "flex", gap: 2 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: "block", flex: "none" }}>
                <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill={colors[botOf(m.bot)?.color] ?? "#3b82f6"} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span style={{ ...pill, marginTop: 12 }}>
                {botOf(m.bot)?.name ?? "A bot"} · {m.what} · {since(m.at)}
              </span>
            </div>
          ))}
      <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {marks
          .filter((m) => m.x === undefined || m.x === null)
          .map((m) => (
            <span key={m.bot} style={{ ...pill, opacity: m.at === newest ? 1 : 0.6 }}>
              {botOf(m.bot)?.name ?? "A bot"} · {m.what}
            </span>
          ))}
      </div>
    </div>
  );
}

// noVNC is an ES module of its own, which the plugin serves; it's loaded once, when a desktop first shows.
let novnc;
const load = (url) => import(url);
const loadRFB = () => (novnc ??= load(new URL("/api/plugins/computer/novnc.js", location.href).href).then((module) => module.default));

const pane = { position: "relative", flex: 1, minHeight: 0, background: "#1e1e1e", borderRadius: 8, overflow: "hidden" };
const cover = { position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: 8, justifyItems: "center", color: "#ccc", fontSize: 14 };

// The desktop, view-only unless `control`, scaled to fit, at the computer's own size. A `peek` only looks, at a computer
// that runs, without keeping it from stopping; when it stops, `onGone`.
function Desktop({ computer, control, hidden, peek, onGone, children }) {
  const box = useRef(null);
  const rfb = useRef(null);
  const [problem, setProblem] = useState("Connecting…");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let gone = false;
    setProblem("Connecting…");
    loadRFB().then(
      (RFB) => {
        if (gone) return;
        const view = new RFB(box.current, socketOf("desktop", computer) + (peek ? "?peek" : ""));
        view.viewOnly = !control;
        view.scaleViewport = true;
        view.resizeSession = false;
        view.background = "#1e1e1e";
        view.addEventListener("connect", () => setProblem(""));
        view.addEventListener("disconnect", (event) => !gone && (peek ? onGone?.() : setProblem(event.detail?.clean ? "Disconnected." : "The connection dropped.")));
        rfb.current = view;
      },
      (error) => setProblem(`The desktop's viewer didn't load: ${error.message}`),
    );
    return () => {
      gone = true;
      rfb.current?.disconnect();
      rfb.current = null;
    };
  }, [computer, attempt]);
  useEffect(() => {
    if (rfb.current) rfb.current.viewOnly = !control;
  }, [control]);
  return (
    <div style={{ ...(peek ? { position: "absolute", inset: 0 } : pane), display: hidden ? "none" : "block" }} aria-label={peek ? "The computer's screen" : "The computer's desktop"}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {!problem && children}
      {problem && !peek && (
        <div style={cover}>
          <span>{problem}</span>
          {problem !== "Connecting…" && (
            <ui.Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Connect again
            </ui.Button>
          )}
        </div>
      )}
    </div>
  );
}

// The terminal: the tmux session `main`, which the bot types in too, sized to the window.
function TerminalView({ computer, hidden }) {
  const box = useRef(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", cursorBlink: true, theme: { background: "#1e1e1e" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current);
    const socket = new WebSocket(socketOf("terminal", computer));
    socket.binaryType = "arraybuffer";
    const resize = () => {
      if (!box.current?.offsetWidth) return;
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
    };
    socket.onopen = () => (setProblem(""), resize());
    socket.onmessage = (event) => term.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
    socket.onclose = () => setProblem("Disconnected.");
    const typing = term.onData((data) => socket.readyState === WebSocket.OPEN && socket.send(new TextEncoder().encode(data)));
    const watch = new ResizeObserver(resize);
    watch.observe(box.current);
    return () => {
      watch.disconnect();
      typing.dispose();
      socket.close();
      term.dispose();
    };
  }, [computer]);
  return (
    <div style={{ ...pane, display: hidden ? "none" : "block" }} aria-label="The computer's terminal">
      <div ref={box} style={{ position: "absolute", inset: 8 }} />
      {problem && <div style={{ ...cover, inset: "auto 0 8px 0" }}>{problem}</div>}
    </div>
  );
}

function ComputerScreen({ params }) {
  const { Button, Header } = ui;
  const key = params.key ?? params.id;
  const bot = useBots()?.find((b) => b.id === key);
  const [state, reload] = useComputer(key, 3000);
  const [tab, setTab] = useState("desktop");
  const [error, setError] = useState("");
  const act = (path, body) => call(`computers/${key}/${path}`, "POST", body).then(() => reload(), (e) => setError(e.message));
  const owner = state?.owner;
  const name = state?.name ?? bot?.name ?? "This bot";
  const asker = owner?.bot ?? name;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Header title={`${name}'s computer`}>
        {state?.running && (
          <Button size="sm" variant={owner ? "default" : "outline"} onClick={() => act("takeover", { on: !owner })}>
            {owner ? "Hand back" : "Take over"}
          </Button>
        )}
      </Header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, padding: "0 12px 12px" }}>
        {owner?.reason && (
          <p className="rounded-md border px-3 py-2 text-sm">
            {state?.shared ? `${asker} asked you: ${owner.reason}. Hand it back when you're done, then tell ${asker} to go on.` : `${name} asked you: ${owner.reason}. Hand it back when you're done, and ${name} carries on.`}
          </p>
        )}
        {owner && !owner.reason && (
          <p className="text-sm text-muted-foreground">You have the mouse and keyboard. {state?.shared ? "The bots'" : `${name}'s`} desktop and terminal tools wait until you hand back.</p>
        )}
        {state && !state.ready && <p className="text-sm">The computer isn't set up on this machine yet: see its section in Settings.</p>}
        {state?.ready && !state.running && (
          <div className="grid justify-items-start gap-2 text-sm">
            <p>{state.exists ? `${name}'s computer is stopped.` : `${name} has no computer yet.`}</p>
            <Button size="sm" onClick={() => act("start")}>
              Start it
            </Button>
          </div>
        )}
        {state?.running && (
          <>
            <div role="tablist" style={{ display: "flex", gap: 4 }}>
              {[
                ["desktop", "Desktop"],
                ["terminal", "Terminal"],
              ].map(([key, label]) => (
                <Button key={key} role="tab" aria-selected={tab === key} size="sm" variant={tab === key ? "secondary" : "ghost"} onClick={() => setTab(key)}>
                  {label}
                </Button>
              ))}
            </div>
            {/* Both stay open, so a take-over holds while you switch: it ends when the last view closes. */}
            <Desktop computer={key} control={Boolean(owner)} hidden={tab !== "desktop"}>
              <Cursors computer={key} hidden={tab !== "desktop"} />
            </Desktop>
            <TerminalView computer={key} hidden={tab !== "terminal"} />
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// Ready, or the command that sets the engine up, with the script it runs.
function Engine({ status, act }) {
  const { Button } = ui;
  const [script, setScript] = useState(null);
  const { engine, command, setup } = status;
  if (engine.state === "ready")
    return (
      <p className="text-sm">
        {engine.name} {engine.version}, rootless, at <span className="font-mono text-xs break-all">{engine.socket}</span>.
      </p>
    );
  if (engine.state !== "rootful" && settingUp(status))
    return (
      <div className="grid gap-2 text-sm">
        <p>
          Setting up the computer on this machine: a user of its own, which runs its podman or docker rootless, and a firewall that keeps its computers to the
          internet. It takes a minute or two{setup.lines ? "" : ", and fxbot starts again when it's done"}.
        </p>
        {setup.lines?.length > 0 && <Code>{setup.lines.join("\n")}</Code>}
      </div>
    );
  const read = () => (script ? setScript(null) : api("script").then((res) => res.text()).then(setScript));
  const failed = engine.state !== "rootful" && setup?.state === "failed";
  const missing = engine.state !== "rootful" && setup?.state === "done";
  return (
    <div className="grid gap-2">
      {(failed || missing) && (
        <div className="grid justify-items-start gap-2 text-sm">
          <p className="text-destructive">{failed ? "Setting up the computer on this machine failed:" : `The computer was set up, but fxbot can't reach its engine at ${engine.socket}.`}</p>
          {failed && setup.error && <Code>{setup.error}</Code>}
          <Button size="sm" variant="outline" onClick={() => act("setup")}>
            Try again
          </Button>
        </div>
      )}
      <p className="text-sm">
        {engine.state === "rootful"
          ? "This engine runs as root, so the computer won't use it. Run the setup script on the machine, as root:"
          : failed || missing
            ? "Or run it on the machine yourself, as root:"
            : "The computer's engine isn't set up on this machine yet. Run this on the machine, once, as root:"}
      </p>
      <Code>{command}</Code>
      <p className="text-xs text-muted-foreground">
        It makes a user of its own that runs this machine's podman or docker rootless, and a firewall that keeps its computers to the internet. Read it before
        you run it.
      </p>
      <Button size="sm" variant="outline" className="justify-self-start" onClick={read}>
        {script ? "Hide the script" : "Read the script"}
      </Button>
      {script && <pre className="max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs">{script}</pre>}
    </div>
  );
}

const describe = (c) =>
  [c.running ? "Running" : "Stopped", c.owner ? (c.owner.reason ? "asking for you" : "yours now") : "", c.used ? `used ${ago(c.used)}` : "", c.home != null ? `home ${size(c.home)}` : ""]
    .filter(Boolean)
    .join(", ");

function SettingsSection() {
  const { Button } = ui;
  const { status, error, act } = useStatus();
  const ready = status?.engine.state === "ready";
  return (
    <section className="grid gap-3" aria-label="Computer">
      {status && <Engine status={status} act={act} />}
      {ready && (
        <div className="grid gap-1.5 text-sm">
          <p>
            Image <span className="font-mono text-xs">{status.image.tag.split(":")[1]}</span>
            <span className="text-muted-foreground">{status.image.size ? `, ${size(status.image.size)}` : status.building ? ", building" : ", made on a bot's first call"}</span>
          </p>
          {status.building && <Code>{status.building.join("\n")}</Code>}
          {status.buildError && <p className="text-destructive">{status.buildError}</p>}
        </div>
      )}
      {ready && status.computers.length > 0 && (
        <ul className="divide-y rounded-xl border text-sm">
          {status.computers.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.name}
                {c.by && <span className="font-normal text-muted-foreground"> · {c.by}</span>}
              </span>
              <span className="text-muted-foreground">{describe(c)}</span>
              <Button size="sm" variant="ghost" onClick={() => go(screenOf(c.key))}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      {ready && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={Boolean(status.building)} onClick={() => act("rebuild")}>
            Rebuild image
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!status.computers.length}
            onClick={() => confirm("Delete every computer, with its home and what it installed?") && act("computers", "DELETE")}
          >
            Delete all computers
          </Button>
        </div>
      )}
      {ready && <p className="text-xs text-muted-foreground">Removing the plugin keeps the computers and their homes. Delete all computers removes them.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function BotSection({ bot }) {
  const { Button } = ui;
  const { status, error, act } = useStatus();
  if (!status || status.engine.state !== "ready") return null;
  const mine = status.computers.find((c) => c.bot === bot.id);
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">Computer</legend>
      <p className="text-sm text-muted-foreground">{!mine ? "None yet: it starts on the bot's first call." : `${describe(mine)}.`}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => go(screenOf(bot.id))}>
          Open computer
        </Button>
        {mine && (
          <>
            <Button type="button" size="sm" variant="outline" disabled={!mine.running} onClick={() => act(`computers/${bot.id}/stop`)}>
              Stop
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => confirm(`Reset ${bot.name}'s computer? Its home and what it installed are deleted.`) && act(`computers/${bot.id}/reset`)}>
              Reset
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

// A computer_desktop call in a reply: what it did, and the screenshot it returned, small; a click shows it whole. The
// plugin keeps screenshots in memory, so one from before fxbot restarted is gone, and shows nothing.
function DesktopCall({ call }) {
  const [whole, setWhole] = useState(false);
  const [gone, setGone] = useState(false);
  const shot = /^Screenshot ([0-9a-f]{8})\./.exec(call.output ?? "")?.[1];
  const { action, coordinate, text } = call.input ?? {};
  const what = [action, Array.isArray(coordinate) ? `(${coordinate.join(", ")})` : "", action === "type" || action === "key" ? JSON.stringify(text) : ""].filter(Boolean).join(" ");
  return (
    <div className="grid justify-items-start gap-1.5 text-sm">
      <p className="text-muted-foreground">
        Computer: {what || "the desktop"}
        {call.done ? "" : "…"}
      </p>
      {call.error && <p className="text-destructive">{call.output}</p>}
      {shot && !gone && (
        <button type="button" onClick={() => setWhole((on) => !on)} aria-label={whole ? "Show the screenshot small" : "Show the screenshot whole"}>
          <img
            src={`/api/plugins/computer/shots/${shot}`}
            alt="The screen after the action"
            onError={() => setGone(true)}
            style={{ maxWidth: whole ? "100%" : 320, borderRadius: 6, border: "1px solid rgba(127,127,127,0.3)" }}
          />
        </button>
      )}
    </div>
  );
}

// Whether the computer is on for a bot, from the list of plugins, read once a page load.
let plugins;
async function onFor(bot) {
  const mine = (await (plugins ??= client.plugins.list())).find((p) => p.name === "computer");
  return Boolean(mine?.enabled && (mine.bots === "all" || mine.on?.includes(bot)));
}

const Monitor = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <line x1="8" x2="16" y1="21" y2="21" />
    <line x1="12" x2="12" y1="17" y2="21" />
  </svg>
);

// Beside the message box, for bots the computer is on for: adds $computer to the message. While the computer runs, a
// dot opens its screen: green, or orange when the bot asked for its owner.
function ComputerButton({ bot, setDraft }) {
  const [on, setOn] = useState(false);
  useEffect(() => void onFor(bot.id).then(setOn, () => {}), [bot.id]);
  const [state] = useComputer(on ? bot.id : null, 15000);
  if (!on) return null;
  const add = () => setDraft((draft) => (/(^|\s)\$computer\b/.test(draft) ? draft : `$computer ${draft}`));
  const asking = state?.owner?.reason;
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <ui.Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label="Use the computer" title="Use the computer: adds $computer to the message" onClick={add}>
        <Monitor />
      </ui.Button>
      {state?.running && (
        <button
          type="button"
          onClick={() => go(screenOf(bot.id))}
          aria-label={asking ? `${bot.name} needs you on its computer: ${asking}` : `Open ${bot.name}'s computer`}
          title={asking ? `${bot.name} needs you: ${asking}` : `Open ${bot.name}'s computer`}
          style={{ position: "absolute", top: 2, right: 2, width: 9, height: 9, borderRadius: 9, border: "2px solid var(--background, #fff)", background: asking ? "#f59e0b" : "#22c55e", padding: 0 }}
        />
      )}
    </span>
  );
}

const Play = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
  </svg>
);

// In a bot's panel, above its tabs, for bots the computer is on for: its screen, small and live, which opens the
// Computer screen; or, while the computer doesn't run, Idle and a button that starts it. Looking here doesn't keep a
// computer from stopping when idle.
function BotScreen({ bot }) {
  const [on, setOn] = useState(false);
  useEffect(() => void onFor(bot.id).then(setOn, () => {}), [bot.id]);
  const [state, reload] = useComputer(on ? bot.id : null, 5000);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  if (!on || !state?.ready) return null;
  const start = () => {
    setStarting(true);
    setError("");
    call(`computers/${bot.id}/start`, "POST")
      .then(() => reload(), (e) => setError(e.message))
      .finally(() => setStarting(false));
  };
  const asking = state.owner?.reason;
  const says = state.running ? (state.owner ? (asking ? "Needs you" : "Yours now") : "Running") : starting ? "Starting…" : "Idle";
  return (
    <section aria-label={`${bot.name}'s computer`} className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Computer</span>
        <span className={asking ? "text-amber-600" : undefined}>{says}</span>
      </div>
      <div style={{ position: "relative", aspectRatio: "16 / 10", borderRadius: 8, overflow: "hidden", background: "#1e1e1e" }}>
        {state.running ? (
          <>
            <Desktop computer={bot.id} peek onGone={reload} />
            <button
              type="button"
              onClick={() => go(screenOf(bot.id))}
              aria-label={`Open ${bot.name}'s computer`}
              title="Open the computer"
              style={{ position: "absolute", inset: 0, background: "transparent", border: 0, cursor: "pointer" }}
            />
          </>
        ) : (
          <div style={{ ...cover, padding: 12, textAlign: "center", fontSize: 13 }}>
            <span>{starting ? "Starting… The first start makes its image, which takes a minute or two." : "Idle"}</span>
            {!starting && (
              <ui.Button type="button" size="icon-sm" variant="secondary" className="rounded-full" aria-label={`Start ${bot.name}'s computer`} title="Start the computer" onClick={start}>
                <Play />
              </ui.Button>
            )}
          </div>
        )}
      </div>
      {asking && <p className="text-xs text-amber-600">{bot.name} needs you: {asking}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

export default function setup(app) {
  app.route("/computers/:key", ComputerScreen);
  // Where a bot's computer was before 0.3.0, so old links still work.
  app.route("/bots/:id", ComputerScreen);
  app.botPanel(BotScreen);
  app.settings(SettingsSection);
  app.botSettings(BotSection);
  app.toolView("desktop", DesktopCall);
  app.composer(ComputerButton);
}
