// The computer in the app:
// - a Computer screen for each bot, at /computer/bots/:id, with its desktop and its terminal, live, and Take over
// - a Settings section with the engine, the image, and each bot's computer, and a section in each bot's settings
// - a view of computer_desktop's calls in a reply, with the screenshot each one returned
// - a Computer button beside the message box, which adds $computer to the message
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

// The plugin's status, read again every 2 seconds while the image builds.
function useStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const load = () => call("status").then((next) => (setStatus(next), setError("")), (e) => setError(e.message));
  useEffect(() => void load(), []);
  useEffect(() => {
    if (!status?.building) return;
    const timer = setTimeout(load, 2000);
    return () => clearTimeout(timer);
  }, [status]);
  const act = (path, method = "POST") => call(path, method).then(setStatus, (e) => setError(e.message));
  return { status, error, act };
}

// One bot's computer: whether it runs, who has it, and how many watch. Read again every `every` ms while the page is on
// screen. No bot, no reads.
function useComputer(bot, every) {
  const [state, setState] = useState(null);
  const load = () => (bot ? call(`bots/${bot}/state`).then(setState, () => {}) : Promise.resolve());
  useEffect(() => {
    void load();
    if (!bot) return;
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), every);
    return () => clearInterval(timer);
  }, [bot, every]);
  return [state, load];
}

const size = (n) => (n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.ceil(n / 1e3)} kB`);
const ago = (at) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};
const Code = ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">{children}</pre>;
const screenOf = (bot) => `/computer/bots/${bot}`;
const socketOf = (kind, bot) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/plugins/computer/${kind}/${bot}`;

// noVNC is an ES module of its own, which the plugin serves; it's loaded once, when a desktop first shows.
let novnc;
const load = (url) => import(url);
const loadRFB = () => (novnc ??= load(new URL("/api/plugins/computer/novnc.js", location.href).href).then((module) => module.default));

const pane = { position: "relative", flex: 1, minHeight: 0, background: "#1e1e1e", borderRadius: 8, overflow: "hidden" };
const cover = { position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: 8, justifyItems: "center", color: "#ccc", fontSize: 14 };

// The desktop, view-only unless `control`, scaled to fit, at the computer's own size.
function Desktop({ bot, control, hidden }) {
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
        const view = new RFB(box.current, socketOf("desktop", bot));
        view.viewOnly = !control;
        view.scaleViewport = true;
        view.resizeSession = false;
        view.background = "#1e1e1e";
        view.addEventListener("connect", () => setProblem(""));
        view.addEventListener("disconnect", (event) => !gone && setProblem(event.detail?.clean ? "Disconnected." : "The connection dropped."));
        rfb.current = view;
      },
      (error) => setProblem(`The desktop's viewer didn't load: ${error.message}`),
    );
    return () => {
      gone = true;
      rfb.current?.disconnect();
      rfb.current = null;
    };
  }, [bot, attempt]);
  useEffect(() => {
    if (rfb.current) rfb.current.viewOnly = !control;
  }, [control]);
  return (
    <div style={{ ...pane, display: hidden ? "none" : "block" }} aria-label="The computer's desktop">
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {problem && (
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
function TerminalView({ bot, hidden }) {
  const box = useRef(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", cursorBlink: true, theme: { background: "#1e1e1e" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current);
    const socket = new WebSocket(socketOf("terminal", bot));
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
  }, [bot]);
  return (
    <div style={{ ...pane, display: hidden ? "none" : "block" }} aria-label="The computer's terminal">
      <div ref={box} style={{ position: "absolute", inset: 8 }} />
      {problem && <div style={{ ...cover, inset: "auto 0 8px 0" }}>{problem}</div>}
    </div>
  );
}

function ComputerScreen({ params }) {
  const { Button, Header } = ui;
  const bot = useBots()?.find((b) => b.id === params.id);
  const [state, reload] = useComputer(params.id, 3000);
  const [tab, setTab] = useState("desktop");
  const [error, setError] = useState("");
  const act = (path, body) => call(`bots/${params.id}/${path}`, "POST", body).then(() => reload(), (e) => setError(e.message));
  const owner = state?.owner;
  const name = bot?.name ?? "This bot";
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
            {name} asked you: {owner.reason}. Hand it back when you're done, and {name} carries on.
          </p>
        )}
        {owner && !owner.reason && <p className="text-sm text-muted-foreground">You have the mouse and keyboard. {name}'s desktop and terminal tools wait until you hand back.</p>}
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
            <Desktop bot={params.id} control={Boolean(owner)} hidden={tab !== "desktop"} />
            <TerminalView bot={params.id} hidden={tab !== "terminal"} />
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// Ready, or the command that sets the engine up, with the script it runs.
function Engine({ status }) {
  const { Button } = ui;
  const [script, setScript] = useState(null);
  const { engine, command } = status;
  if (engine.state === "ready")
    return (
      <p className="text-sm">
        {engine.name} {engine.version}, rootless, at <span className="font-mono text-xs break-all">{engine.socket}</span>.
      </p>
    );
  const read = () => (script ? setScript(null) : api("script").then((res) => res.text()).then(setScript));
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        {engine.state === "rootful"
          ? "This engine runs as root, so the computer won't use it. Run the setup script on the machine, as root:"
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
      <h2 className="font-medium">Computer</h2>
      {status && <Engine status={status} />}
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
            <li key={c.bot} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <span className="text-muted-foreground">{describe(c)}</span>
              <Button size="sm" variant="ghost" onClick={() => go(screenOf(c.bot))}>
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
            onClick={() => confirm("Delete every bot's computer, with its home and what it installed?") && act("computers", "DELETE")}
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
            <Button type="button" size="sm" variant="outline" disabled={!mine.running} onClick={() => act(`bots/${bot.id}/stop`)}>
              Stop
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => confirm(`Reset ${bot.name}'s computer? Its home and what it installed are deleted.`) && act(`bots/${bot.id}/reset`)}>
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

export default function setup(app) {
  app.route("/bots/:id", ComputerScreen);
  app.settings(SettingsSection);
  app.botSettings(BotSection);
  app.toolView("desktop", DesktopCall);
  app.composer(ComputerButton);
}
