// The Routines section in a bot's settings: each routine with its schedule, its switch, and its newest runs, and how
// routines_add shows in a reply, with Remove. A bot makes and changes routines, so there's no form. Built into page.js;
// see the README.
import { useEffect, useState } from "react";
import { api, ui } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

const when = (at, timeZone, weekday) => new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(weekday ? { weekday: "short" } : {}) }).format(new Date(at));
const outcome = (run) =>
  ({
    running: "Running…",
    done: run.untold ? "Couldn't reach the chat" : "Told you",
    quiet: "Nothing to say",
    failed: `Failed: ${run.reply}`,
    stopped: run.reply || "Stopped",
    skipped: "Skipped: the last run was still going",
    missed: "Missed: fxbot wasn't running",
  })[run.state];

function Run({ run, timeZone, onShow, onStop }) {
  const { Button } = ui;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground tabular-nums">{when(run.startedAt, timeZone)}</span>
      <span className="min-w-0 flex-1 break-words">{outcome(run)}</span>
      {run.state === "running" && (
        <Button type="button" size="xs" variant="outline" onClick={() => onStop(run)}>
          Stop
        </Button>
      )}
      {run.state === "done" && (
        <Button type="button" size="xs" variant="ghost" onClick={() => onShow(run)}>
          Show
        </Button>
      )}
      {run.files.map((file) => (
        <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          {file.name}
        </a>
      ))}
    </li>
  );
}

function Routines({ bot }) {
  const { Button, Switch, Dialog, DialogContent, DialogHeader, DialogTitle } = ui;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(null);
  const load = () => call(`bots/${bot.id}`).then(setData, (e) => setError(e.message));
  const act = (work) => (setError(""), work.then(load, (e) => setError(e.message)));
  useEffect(() => void load(), [bot.id]);
  // While a run goes, the section follows it.
  const going = data?.routines.some((r) => r.runs.some((run) => run.state === "running"));
  useEffect(() => {
    if (!going) return;
    const again = setTimeout(load, 5000);
    return () => clearTimeout(again);
  }, [data]);
  if (!data) return null;
  const { timeZone } = data;
  const remove = (r) => window.confirm(`Remove the routine ${r.name}?`) && act(call(`routines/${r.id}`, "DELETE"));

  return (
    <section className="grid gap-3 text-sm" aria-label="Routines">
      <h2 className="font-medium">Routines</h2>
      <p className="text-muted-foreground">
        {data.on
          ? `Times are in ${timeZone}, from Settings › General. To add or change a routine, ask this bot.`
          : "routines is off for this bot, so its routines don't run."}
      </p>
      {data.routines.length > 0 && (
        <ul className="grid gap-4">
          {data.routines.map((r) => (
            <li key={r.id} className="grid gap-1.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <Switch aria-label={`Run ${r.name}`} checked={!r.paused} disabled={!r.nextAt} onCheckedChange={(on) => act(call(`routines/${r.id}`, "PUT", { paused: !on }))} />
              </div>
              <p className="text-muted-foreground">
                {r.words}
                {r.pausedByFailures ? ` · paused after ${r.failures} failures` : r.paused ? " · paused" : r.nextAt ? ` · next ${when(r.nextAt, timeZone, true)}` : " · finished"}
              </p>
              <p className="break-words">{r.task}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!data.on || r.runs.some((run) => run.state === "running")} onClick={() => act(call(`routines/${r.id}/run`, "POST"))}>
                  Run now
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(r)}>
                  Remove
                </Button>
              </div>
              {r.runs.length > 0 && (
                <ul className="grid gap-1">
                  {r.runs.map((run) => (
                    <Run key={run.id} run={run} timeZone={timeZone} onShow={setShown} onStop={(one) => act(call(`runs/${one.id}/stop`, "POST"))} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-destructive">{error}</p>}
      <Dialog open={Boolean(shown)} onOpenChange={(open) => !open && setShown(null)}>
        <DialogContent className="overflow-y-auto" style={{ maxHeight: "85dvh", maxWidth: "min(42rem, calc(100% - 2rem))" }}>
          <DialogHeader>
            <DialogTitle>{shown && when(shown.startedAt, timeZone)}</DialogTitle>
          </DialogHeader>
          <pre className="text-xs whitespace-pre-wrap">{shown?.reply}</pre>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// routines_add in a reply: the line it answered, with Remove, so a routine a bot was talked into is one click from gone.
function Added({ call: tool }) {
  const { Button } = ui;
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const id = /^Added r:(\d+)/.exec(tool.output ?? "")?.[1];
  return (
    <div className="grid gap-1.5 text-sm">
      <p className="text-muted-foreground">{tool.done ? tool.output : "Saving a routine…"}</p>
      {id && !removed && (
        <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => call(`routines/${id}`, "DELETE").then(() => setRemoved(true), (e) => setError(e.message))}>
          Remove
        </Button>
      )}
      {removed && <p className="text-muted-foreground">Removed.</p>}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}

export default function setup(app) {
  app.botSettings(Routines);
  app.toolView("add", Added, { open: true });
}
