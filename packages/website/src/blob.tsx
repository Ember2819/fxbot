// The bots' look, drawn by a copy of the app's packages/ui/src/blob-draw.ts, once at build time, into static SVG. site.css
// holds the blink and the hop, and client.ts turns the eyes toward the pointer.
import type { CSSProperties } from "react";
import { outlines, tones } from "./blob-data.ts";
import { drawBlob, type Look } from "./blob-draw.ts";

export const shapeCount = Object.keys(outlines).length;
export const colorCount = Object.keys(tones).length;

// Each blob blinks at its own time in the 6-second cycle: the next step of the golden ratio, so blobs drawn one after
// another stay well apart, and every build draws the same.
let drawnCount = 0;
const nextBlink = () => `${-((drawnCount++ * 0.618034) % 1) * 6}s`;

// A bot's look. `follow` turns its eyes toward the pointer (client.ts), and `busy` makes it hop and look around.
export function Blob({ mood = "bright", size = 40, follow = false, busy = false, className = "", ...look }: Look & { mood?: string; size?: number; follow?: boolean; busy?: boolean; className?: string }) {
  const blink = { "--blink": nextBlink() } as CSSProperties;
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" data-follow={follow || undefined} data-busy={busy || undefined} className={`blob shrink-0 overflow-visible ${className}`} style={blink} dangerouslySetInnerHTML={{ __html: drawBlob(look, busy ? "focus" : mood, size, `blob${drawnCount}`) }} />;
}
