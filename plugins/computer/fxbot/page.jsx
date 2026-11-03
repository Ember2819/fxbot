// The computer in the app: a Settings section with the engine, the image, and each bot's computer, and a section in
// each bot's settings with its own. Built into page.js; see the README.
import { useEffect, useState } from "react";
import { api, ui } from "@fxbot/app";

async function call(path, method = "GET") {
  const res = await api(path, { method });
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

const size = (n) => (n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.ceil(n / 1e3)} kB`);
const ago = (at) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};
const Code = ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">{children}</pre>;

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
              <span className="text-muted-foreground">
                {c.running ? "Running" : "Stopped"}
                {c.used ? `, used ${ago(c.used)}` : ""}
                {c.home != null ? `, home ${size(c.home)}` : ""}
              </span>
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
      <p className="text-sm text-muted-foreground">
        {!mine ? "None yet: it starts on the bot's first call." : `${mine.running ? "Running" : "Stopped"}${mine.used ? `, used ${ago(mine.used)}` : ""}${mine.home != null ? `, home ${size(mine.home)}` : ""}.`}
      </p>
      {mine && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!mine.running} onClick={() => act(`bots/${bot.id}/stop`)}>
            Stop
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => confirm(`Reset ${bot.name}'s computer? Its home and what it installed are deleted.`) && act(`bots/${bot.id}/reset`)}>
            Reset
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

export default function setup(app) {
  app.settings(SettingsSection);
  app.botSettings(BotSection);
}
