// A screen button in a chat room's header, in the place chat rooms leaves for it: a dialog that gives the room a
// computer of its own, or turns it off, and opens it on the computer's own screen. Built into page.js; see the README.
import { useEffect, useState } from "react";
import { api, go, ui } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
}

const Screen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

function RoomComputer({ room }) {
  const { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Switch } = ui;
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => void call(`rooms/${room.id}`).then(setState, () => {}), [room.id]);
  async function turn(on) {
    setBusy(true);
    setError("");
    try {
      const next = await call(`rooms/${room.id}`, "PUT", { on });
      // Off stops the computer, and keeps its home.
      if (!on && next.key) await fetch(`/api/plugins/computer/computers/${next.key}/stop`, { method: "POST" }).catch(() => {});
      setState(next);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`${room.name}'s computer`} title={`${room.name}'s computer`} onClick={() => setOpen(true)} style={{ position: "relative" }}>
        <Screen />
        {state?.on && <span aria-hidden="true" style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3, background: "#22c55e" }} />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{room.name}'s computer</DialogTitle>
            <DialogDescription>
              Give {room.name} a computer of its own. Its bots share it in this room, taking turns, and keep their own computers for their own chats.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Computer
            <Switch checked={Boolean(state?.on)} disabled={busy || !state} onCheckedChange={turn} />
          </label>
          {state?.on && (
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => go(`/computer/computers/${state.key}`)}>
                Open
              </Button>
              <p className="text-sm text-muted-foreground">Turning it off stops it and keeps its files.</p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function setup(app) {
  app.slot("chat-rooms.room-header", RoomComputer);
}
