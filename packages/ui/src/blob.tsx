import { useEffect, useMemo, useRef } from "react";
import type { Color, Face, Head, Mood, Outfit, Shape, Tint } from "@fxbot/sdk/client";
import { drawBlob, eye, feeling, glintAt, glintShows, layout, type Eye, type Look } from "./blob-draw.ts";

type Point = [number, number];
type Doing = { mood: string; follow: boolean; busy: boolean; waiting: boolean; asleep: boolean };
type Mate = { node: SVGSVGElement; next: number; tick: (t: number) => boolean; set: (doing: Doing) => void; poke: () => void };

// Every bot on the page shares one loop, which runs frames only while one is moving. Otherwise it's one timer, for the
// next blink. `next` is when a bot at rest wants to move again.
const mates = new Set<Mate>();
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pointer: { x: number; y: number; at: number } | null = null;
const wake = () => {
  clearTimeout(timer);
  frame ||= requestAnimationFrame(run);
};
function run(t: number) {
  frame = 0;
  let moving = false;
  let next = Infinity;
  for (const mate of mates) {
    if (mate.tick(t)) moving = true;
    next = Math.min(next, mate.next);
  }
  if (moving) frame = requestAnimationFrame(run);
  else if (next < Infinity) timer = setTimeout(wake, Math.max(16, next - performance.now()));
}
function moved(event: PointerEvent) {
  pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  wake();
}
function join(mate: Mate) {
  if (!mates.size) addEventListener("pointermove", moved, { passive: true });
  mates.add(mate);
  wake();
  return () => {
    mates.delete(mate);
    if (!mates.size) removeEventListener("pointermove", moved);
  };
}

const keys = ["w", "h", "lt", "lb", "st", "ct", "cb", "n"] as const;
const center = (node: Element) => {
  const box = node.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width };
};

// One bot's motion: what it's doing picks where it looks, how it moves, and how its eyes are, and each eases there.
function animate(node: SVGSVGElement, look: Look, size: number, start: Doing): Mate {
  const one = (name: string) => node.querySelector(`.${name}`);
  const lean = one("blob-lean")!, eyes = one("blob-eyes")!, shine = one("blob-shine"), left = one("blob-eye-l")!, right = one("blob-eye-r")!, glints = [one("blob-glint-l"), one("blob-glint-r")];
  const layers = [...node.querySelectorAll(".blob-far, .blob-mid")].map((group) => ({ group, by: group.classList.contains("blob-mid") ? 0.62 : 0.24, anti: [...group.querySelectorAll(".blob-anti")], inner: [...group.querySelectorAll(".blob-in")] }));
  const { cx, cy, gap, k } = layout(look, size);
  const [lx, rx] = [cx - gap / 2, cx + gap / 2];
  let doing = start;
  let shown = "";
  let wanted = feeling(start.mood, k);
  const [l, r]: Eye[] = [{ ...wanted.l }, { ...wanted.r }];
  let [gx, gy, tilt, near, last] = [0, 0, 0, 0, performance.now()];
  let glance: Point = [0, 0];
  let [nextLook, nextBlink, blinkAt, pokedAt, happyUntil] = [last + Math.random() * 3000, last + 800 + Math.random() * 4000, -1e9, -1e9, 0];

  function lookAround(t: number, x: number, y: number) {
    if (t < nextLook) return;
    nextLook = t + (1300 + Math.random() * 3400) * (1 + mates.size / 6);
    const others = [...mates].filter((mate) => mate.node !== node && mate.node.isConnected), chance = Math.random();
    const other = others.length && chance >= 0.42 && chance < 0.8 ? center(others[Math.floor(Math.random() * others.length)].node) : null;
    if (other?.width) {
      const [dx, dy] = [other.x - x, other.y - y], distance = Math.hypot(dx, dy) || 1;
      glance = [(dx / distance) * 7.5, (dy / distance) * 5.5];
    } else glance = chance < 0.42 ? [0, 0] : [(Math.random() - 0.5) * 13, (Math.random() - 0.5) * 8];
  }

  const mate: Mate = {
    node,
    next: Math.min(nextBlink, nextLook),
    set(next) {
      if (doing.busy && !next.busy && !next.asleep) happyUntil = performance.now() + 4000;
      doing = next;
      wake();
    },
    poke() {
      pokedAt = performance.now();
      wake();
    },
    tick(t) {
      const dt = Math.min(48, t - last);
      last = t;
      const ease = (ms: number) => 1 - Math.exp(-dt / ms);
      const { busy, waiting, asleep } = doing;
      const fresh = doing.follow && pointer !== null && t - pointer.at < 3200;
      const here = fresh || size >= 32 ? center(node) : { x: 0, y: 0, width: 0 };
      let [dx, dy] = fresh ? [pointer!.x - here.x, pointer!.y - here.y] : [0, 0];
      const distance = Math.hypot(dx, dy) || 1, reach = fresh ? Math.min(1, distance / (here.width * 1.5)) : 0;
      [dx, dy] = [dx / distance, dy / distance];
      let mood = doing.mood;
      let target: Point = [dx * 8.5 * reach, dy * 6.5 * reach];
      let [turn, lift, sx, sy] = [dx * 6 * reach, 0, 1, 1];
      if (asleep) {
        mood = "asleep";
        target = [0, 0];
        turn = 0;
      } else if (waiting) {
        const bob = Math.max(0, Math.sin(t / 300)) ** 3 * (t % 2400 < 940 ? 1 : 0);
        lift = -bob * 5;
        sy += bob * 0.03;
        sx -= bob * 0.03;
        if (!fresh) target = [0, -2];
      } else if (busy) {
        mood = "focus";
        const hop = (t % 1100) / 1100, round = (t % 2600) / 2600, swing = Math.sin(hop * 2 * Math.PI), squash = Math.cos(hop * 4 * Math.PI) * 0.035;
        lift = -Math.abs(swing) * 6;
        turn = swing * 4.5;
        sx += squash;
        sy -= squash;
        target = round < 0.1 ? [0, 0] : round < 0.42 ? [-7, -3.5] : round < 0.72 ? [7, -3] : round < 0.92 ? [3, 5] : [0, 0];
      } else {
        if (t < happyUntil) mood = "happy";
        if (!fresh && size >= 32) {
          lookAround(t, here.x, here.y);
          target = glance;
        }
      }
      const since = t - pokedAt, poked = since < 1100;
      if (poked) {
        const tau = since / 1000, wobble = Math.exp(-5 * tau) * Math.sin(17 * tau);
        sx += wobble * 0.17;
        sy -= wobble * 0.17;
        lift -= Math.exp(-6 * tau) * Math.abs(Math.sin(9 * tau)) * 7;
        if (!asleep) mood = "happy";
      }
      if (mood !== shown) wanted = feeling((shown = mood), k);
      target = [target[0] + wanted.gaze[0], target[1] + wanted.gaze[1]];

      const moves = Math.abs(target[0] - gx) + Math.abs(target[1] - gy) + Math.abs(turn - tilt) > 0.04;
      gx += (target[0] - gx) * ease(55);
      gy += (target[1] - gy) * ease(55);
      tilt += (turn - tilt) * ease(150);
      const close = fresh && distance < here.width * 0.6 ? 1 : 0, widens = Math.abs(close - near) > 0.01;
      near += (close - near) * ease(120);
      let changes = false;
      for (const key of keys) {
        if (Math.abs(wanted.l[key] - l[key]) + Math.abs(wanted.r[key] - r[key]) > 0.01) changes = true;
        l[key] += (wanted.l[key] - l[key]) * ease(85);
        r[key] += (wanted.r[key] - r[key]) * ease(85);
      }
      if (t > nextBlink && !asleep) {
        blinkAt = t;
        nextBlink = t + (Math.random() < 0.18 ? 240 : (1800 + Math.random() * 4600) * (1 + mates.size / 12));
      }
      const blinkPart = (t - blinkAt) / 150, blink = blinkPart >= 0 && blinkPart <= 1 && !asleep ? Math.sin(blinkPart * Math.PI) : 0;
      const hopping = busy || waiting || poked;

      if (changes || widens || blink > 0 || blinkPart < 1.3) {
        const lidded = (e: Eye): Eye => ({ ...e, lt: e.lt + (0.5 - e.lt) * blink, lb: e.lb + (0.5 - e.lb) * blink, w: e.w * (1 + 0.07 * near), h: e.h * (1 + 0.07 * near) });
        const [el, er] = [lidded(l), lidded(r)];
        left.setAttribute("d", eye(lx, cy, el));
        right.setAttribute("d", eye(rx, cy, er));
        [[glints[0], lx, el], [glints[1], rx, er]].forEach(([glint, x, e]) => {
          if (!glint) return;
          const [px, py] = glintAt(x as number, cy, e as Eye), node = glint as Element;
          node.setAttribute("cx", px.toFixed(2));
          node.setAttribute("cy", py.toFixed(2));
          node.setAttribute("r", (wanted.glint || 0.01).toFixed(2));
          node.setAttribute("opacity", Math.max(0, glintShows(e as Eye) - blink * 2.5).toFixed(2));
        });
      }
      if (moves || hopping) {
        eyes.setAttribute("transform", `translate(${gx.toFixed(2)} ${gy.toFixed(2)})`);
        shine?.setAttribute("transform", `translate(${(-gx * 0.55).toFixed(2)} ${(-gy * 0.55).toFixed(2)})`);
        for (const { group, by, anti, inner } of layers) {
          const [x, y] = [(gx * by).toFixed(2), (gy * by).toFixed(2)];
          group.setAttribute("transform", `translate(${x} ${y})`);
          for (const cut of anti) cut.setAttribute("transform", `translate(${-x} ${-y})`);
          for (const worn of inner) worn.setAttribute("transform", `translate(${x} ${y})`);
        }
        lean.setAttribute("transform", `translate(0 ${lift.toFixed(2)}) rotate(${tilt.toFixed(2)} 50 62) translate(50 92) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -92)`);
      }
      mate.next = Math.min(asleep ? Infinity : nextBlink, !asleep && size >= 32 ? nextLook : Infinity, t < happyUntil ? happyUntil : Infinity, fresh ? pointer!.at + 3200 : Infinity);
      return moves || hopping || changes || widens || blink > 0;
    },
  };
  return mate;
}

let drawn = 0;
const stillPlease = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A bot's look. Pass a whole bot, as in <Blob {...bot} size={24} />, and it shows what the bot is doing: `busy` makes it
// hop and look around, `waiting` look at you, and an empty `provider` sleep, since it can't answer. With `follow`, its eyes
// and lean follow the pointer. `still` draws it once, for a list of choices, as does reduced motion.
export function Blob({ shape, color, mood = "bright", head = "none", face = "none", outfit = "none", tint = "own", size = 40, follow = false, busy = false, waiting = false, provider, still = false, className = "" }: { shape: Shape; color: Color; mood?: Mood; head?: Head; face?: Face; outfit?: Outfit; tint?: Tint; size?: number; follow?: boolean; busy?: boolean; waiting?: boolean; provider?: string; still?: boolean; className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const mate = useRef<Mate | null>(null);
  const seen = useRef(false);
  const id = useMemo(() => `blob${++drawn}`, []);
  const asleep = provider === "";
  const held = still || stillPlease();
  const doing = { mood, follow, busy, waiting, asleep };
  const first = useRef(mood);
  const shown = asleep ? "asleep" : busy && !waiting ? "focus" : mood;
  const look: Look = { shape, color, head, face, outfit, tint };
  // A change of feeling melts in the motion, so only a bot held still draws again for one.
  const html = useMemo(() => drawBlob(look, held ? shown : first.current, size, id), [shape, color, head, face, outfit, tint, size, id, held, held && shown]);
  useEffect(() => {
    if (held) return;
    const live = animate(svg.current!, look, size, doing);
    mate.current = live;
    const leave = join(live);
    if (seen.current) live.poke();
    seen.current = true;
    return () => {
      mate.current = null;
      leave();
    };
  }, [html, held]);
  useEffect(() => mate.current?.set(doing), [mood, follow, busy, waiting, asleep]);
  return <svg ref={svg} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" data-shape={shape} data-busy={busy || undefined} data-waiting={waiting || undefined} data-asleep={asleep || undefined} onPointerDown={() => mate.current?.poke()} className={`blob shrink-0 overflow-visible ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
