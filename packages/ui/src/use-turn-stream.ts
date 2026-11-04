import { applyLine, type StreamLine, type Turn } from "@fxbot/sdk/client";
import { useEffect, useRef, useState } from "react";
import { client } from "./client.ts";

// Whether the page is on screen: not a background tab, a minimized window, or a phone's locked screen.
export function useVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  return visible;
}

// A bot's thread, read from its stream from the start and followed while it has a `session`. A hidden page closes the
// stream, so a phone in a pocket holds no connection, and opens it again from the last line it read when it's shown.
// `ready` is false until the chat's lines so far have arrived. When the chat starts over, its stream ends with a moved
// line, which calls `onMoved`; the page reads the bot again, and its new session is read from the start, with the
// finished turns left to the earlier chat.
export function useTurnStream(profileId: string, session: string | null, onMoved: () => void) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [connected, setConnected] = useState(true);
  const [ready, setReady] = useState(false);
  const visible = useVisible();
  const cursor = useRef(0);
  const following = useRef(session);
  const moved = useRef(onMoved);
  moved.current = onMoved;

  useEffect(() => {
    if (!session || !visible) return;
    if (following.current !== session) {
      if (following.current) setTurns((turns) => turns.filter((turn) => !turn.done));
      following.current = session;
      cursor.current = 0;
    }
    const abort = new AbortController();
    // The lines each connection replays are held, and shown together once it has caught up, so the chat opens at its
    // end instead of scrolling past each turn as it arrives. Lines after that show as they come.
    let held: StreamLine[] = [];
    let holding = true;
    const show = (lines: StreamLine[]) => {
      for (const line of lines) cursor.current = line.cursor ?? cursor.current;
      if (lines.length) setTurns((turns) => lines.reduce(applyLine, turns));
    };
    const caughtUp = () => {
      holding = false;
      show(held);
      held = [];
      setReady(true);
    };
    const connection = (on: boolean) => {
      setConnected(on);
      if (on) holding = true;
    };
    (async () => {
      for await (const line of client.stream(profileId, { cursor: cursor.current, session, signal: abort.signal, onConnection: connection, onCaughtUp: caughtUp })) {
        if (line.type === "moved") moved.current();
        else if (holding) held.push(line);
        else show([line]);
      }
    })();
    return () => abort.abort();
  }, [profileId, session, visible]);

  return { turns, setTurns, connected, ready };
}
