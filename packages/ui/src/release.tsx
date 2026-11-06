import { useEffect, useState } from "react";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@fxbot/sdk/client";
import { client } from "./client.ts";
import { pageVersion, reloadNow } from "./pwa.ts";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Settings' version row. When a newer release is out it shows the notes, and Update in an install made by setup.sh,
// where the machine carries out the update. During an update it shows each step the machine reports, waits while the
// app restarts, and reloads the page once the server names the new version, or shows why it went back.
export function Version() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [restarting, setRestarting] = useState(false);
  const read = () => client.update.get().then(setStatus, (e: Error) => setError(e.message));
  useEffect(() => void read(), []);

  const running = Boolean(status?.updating && !status.updating.error);
  useEffect(() => {
    if (!running || restarting) return;
    const timer = setInterval(() => client.update.get().then(setStatus, () => setRestarting(true)), 1000);
    return () => clearInterval(timer);
  }, [running, restarting]);
  // The machine stops the app and starts the new release, whose migrations run first. If it doesn't start, the old one
  // comes back with the reason.
  useEffect(() => {
    if (!restarting || !status) return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        await wait(1500);
        const now = await client.update.get().catch(() => null);
        if (now && now.version !== status.version) return void reloadNow();
        if (now?.updating?.error) {
          setStatus(now);
          return setRestarting(false);
        }
      }
    })();
    return () => void (stopped = true);
  }, [restarting]);

  const start = () => {
    if (!confirm(`Update fxbot to ${status!.latest!.version}? The machine downloads it, then fxbot restarts, and running chats finish first.`)) return;
    client.update.start().then(setStatus, (e: Error) => setError(e.message));
  };
  if (!status) return error ? <p className="text-sm text-destructive">{error}</p> : null;
  const { version, latest, canUpdate, updating } = status;
  const behind = pageVersion !== version;
  // A failed update can be tried again.
  const idle = !updating || Boolean(updating.error);

  if (!latest && idle && !behind) return <p className="text-sm text-muted-foreground">fxbot {version}</p>;
  return (
    <section aria-label="Version" className="grid gap-3 rounded-xl border p-3 text-sm">
      <p className="font-medium">
        fxbot {version}
        {latest && <span className="font-normal text-muted-foreground"> · {latest.version} is out</span>}
      </p>
      {behind && idle && (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-muted-foreground">This page is from {pageVersion}.</p>
          <Button size="sm" variant="outline" onClick={() => void reloadNow()}>
            Reload
          </Button>
        </div>
      )}
      {latest && idle && (
        <>
          {latest.notes && (
            <div className="max-h-48 overflow-y-auto text-muted-foreground">
              <Streamdown>{latest.notes}</Streamdown>
            </div>
          )}
          {latest.url && (
            <a href={latest.url} target="_blank" rel="noreferrer" className="justify-self-start underline underline-offset-4">
              Release notes
            </a>
          )}
          {status.wontRun.length > 0 && <p className="text-destructive">Won't run on {latest.version}: {status.wontRun.join(", ")}.</p>}
          {canUpdate ? (
            <Button className="justify-self-start" onClick={start}>
              Update to {latest.version}
            </Button>
          ) : (
            <p className="text-muted-foreground">Settings updates an install made by setup.sh. This checkout updates with git.</p>
          )}
        </>
      )}
      {updating && (
        <ol className="grid gap-1.5">
          {updating.steps.map((step, i) => (
            <li key={i} className="flex items-center gap-2">
              {i < updating.steps.length - 1 || restarting ? <CheckIcon className="size-4" /> : updating.error ? <span className="size-4" /> : <LoaderCircleIcon className="size-4 animate-spin" />}
              {step}
            </li>
          ))}
          {restarting && (
            <li className="flex items-center gap-2">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Restarting on {updating.to}
            </li>
          )}
        </ol>
      )}
      {(updating?.error || error) && <p className="whitespace-pre-wrap text-destructive">{updating?.error || error}</p>}
    </section>
  );
}
