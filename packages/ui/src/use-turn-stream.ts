import { applyLine, type Turn } from "@fxbot/sdk/client";
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

// A bot's thread, read from its stream from the start and followed while `live`. A hidden page closes the stream,
// since an open one costs the server CPU the whole time (more the longer the chat), and opens it again from the last
// line it read when it's shown.
export function useTurnStream(profileId: string, live: boolean) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [connected, setConnected] = useState(true);
  const visible = useVisible();
  const cursor = useRef(0);

  useEffect(() => {
    if (!live || !visible) return;
    const abort = new AbortController();
    (async () => {
      for await (const line of client.stream(profileId, { cursor: cursor.current, signal: abort.signal, onConnection: setConnected })) {
        cursor.current = line.cursor ?? cursor.current;
        setTurns((turns) => applyLine(turns, line));
      }
    })();
    return () => abort.abort();
  }, [profileId, live, visible]);

  return { turns, setTurns, connected };
}
