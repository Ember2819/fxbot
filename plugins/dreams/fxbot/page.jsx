// The Dreams section in a bot's settings: when it dreams, each night with what it read and each change it made, with
// its sources and Undo, Dream now, and the bot's skills from dreams. Built into page.js; see the README.
import { useEffect, useState } from "react";
import { api, ui } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

const dayOf = (night) => new Date(`${String(night).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const hourOf = (hour) => `${String(hour).padStart(2, "0")}:00`;
const turns = (n) => `${n} ${n === 1 ? "turn" : "turns"}`;
const what = (c) =>
  c.kind === "skill" ? (c.before ? "Rewrote a skill" : "Made a skill") : c.merged_into ? "Merged a memory" : c.before ? "Changed a memory" : "Saved a memory";

// One night: when, what it read, and how it ended, then its changes.
function nightLine(n) {
  if (n.state === "dreaming") return `${dayOf(n.night)} · Dreaming…`;
  if (n.state === "off") return `${dayOf(n.night)} · dreams is off for this bot`;
  const read = n.turns ? `read ${turns(n.turns)}${n.left_out ? `, ${n.left_out} left out` : ""}` : "nothing to read";
  return `${dayOf(n.night)} · ${read} · ${n.state === "failed" ? `Failed: ${n.summary}` : n.summary || "Done."}`;
}

function Change({ change, onUndo, problem, onShow }) {
  const { Button } = ui;
  const now = change.kind === "skill" ? change.target : change.after.text;
  return (
    <li className="grid gap-1 py-2">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-muted-foreground">{what(change)}</span>
        {change.kind === "skill" && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onShow({ name: change.target, ...change.after })}>
            Show
          </Button>
        )}
        {change.undone_at ? (
          <span className="text-xs text-muted-foreground">Undone</span>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => onUndo(change)}>
            Undo
          </Button>
        )}
      </div>
      <span className="break-words">{now}</span>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {change.kind === "memory" && change.before && <span>was: {change.before.text}</span>}
        {change.merged_into && <span>merged into {change.merged_into}, which already said that</span>}
        {change.sources.map((s) => (
          <span key={s.id}>
            {s.id}, {s.at}: “{s.owner}”
          </span>
        ))}
        {problem && <span className="text-destructive">{problem}</span>}
      </div>
    </li>
  );
}

function Dreams({ bot }) {
  const { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } = ui;
  const [data, setData] = useState(null);
  const [older, setOlder] = useState([]);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState({});
  const [shown, setShown] = useState(null);
  const load = () =>
    call(`bots/${bot.id}`).then(
      (next) => (setData(next), setError("")),
      (e) => setError(e.message),
    );
  useEffect(() => void ((setOlder([]), load())), [bot.id]);
  // While a dream runs, the section reads again every 5 seconds until it ends.
  useEffect(() => {
    if (!data?.dreaming) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [data?.dreaming]);
  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : null;

  const dreamNow = () => call(`bots/${bot.id}/dream`, "POST").then(() => setTimeout(load, 1000), (e) => setError(e.message));
  const undo = (change) =>
    call(`changes/${change.id}/undo`, "POST").then(
      () => (setProblems((all) => ({ ...all, [change.id]: "" })), load()),
      (e) => setProblems((all) => ({ ...all, [change.id]: e.message })),
    );
  const nights = [...data.nights, ...older];
  const more = () => call(`bots/${bot.id}?before=${nights.at(-1).id}`).then((next) => setOlder((all) => [...all, ...next.nights]), (e) => setError(e.message));
  const remove = (name) => window.confirm(`Remove the skill ${name}? It came from a dream.`) && call(`bots/${bot.id}/skills/${encodeURIComponent(name)}`, "DELETE").then(load, (e) => setError(e.message));
  const when = `${hourOf(data.hour)}, ${data.timeZone}`;

  return (
    <section className="grid gap-3 text-sm" aria-label="Dreams">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 font-medium">Dreams</h2>
        <Button type="button" size="sm" variant="outline" disabled={data.dreaming} onClick={dreamNow}>
          Dream now
        </Button>
      </div>
      <p className="text-muted-foreground">
        {data.dreaming ? "Dreaming…" : `Each night at ${when}, from Settings › General, after ${turns(data.minTurns)}. ${turns(data.waiting)} since the last dream.`}
      </p>
      {nights.length > 0 && (
        <ul className="grid gap-3">
          {nights.map((n) => (
            <li key={n.id} className="grid gap-1">
              <p className="font-medium">{nightLine(n)}</p>
              {n.changes.length > 0 && (
                <ul className="divide-y">
                  {n.changes.map((c) => (
                    <Change key={c.id} change={c} problem={problems[c.id]} onUndo={undo} onShow={setShown} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.nights.length === 14 && (
        <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={more}>
          Older
        </Button>
      )}
      {data.skills.length > 0 && (
        <div className="grid gap-1">
          <h3 className="font-medium">Skills from dreams</h3>
          <ul className="divide-y">
            {data.skills.map((s) => (
              <li key={s.name} className="grid gap-1 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex-1 truncate font-medium">{s.name}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShown(s)}>
                    Show
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(s.name)}>
                    Remove
                  </Button>
                </div>
                <span className="break-words text-muted-foreground">{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
      <Dialog open={Boolean(shown)} onOpenChange={(open) => !open && setShown(null)}>
        <DialogContent className="overflow-y-auto" style={{ maxHeight: "85dvh", maxWidth: "min(42rem, calc(100% - 2rem))" }}>
          <DialogHeader>
            <DialogTitle>{shown?.name}</DialogTitle>
            <DialogDescription>{shown?.description}</DialogDescription>
          </DialogHeader>
          <pre className="text-xs whitespace-pre-wrap">{shown?.instructions}</pre>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function setup(app) {
  app.botSettings(Dreams);
}
