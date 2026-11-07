// A bot's look, as SVG markup: its body, the eyes that carry its feeling, and what it wears, each cut to the body's own
// outline so it sits right on any shape. No React and no SDK, so packages/website/src/blob-draw.ts can be a copy. Every
// value drawn is a number or from a list, never anything typed.
import { outlines, tones } from "./blob-data.ts";

export type Look = { shape: string; color: string; head?: string; face?: string; outfit?: string; tint?: string };
export type Eye = { w: number; h: number; lt: number; lb: number; st: number; ct: number; cb: number; n: number };
type Point = [number, number];

const f = (n: number) => +n.toFixed(2);
const flat: Eye = { w: 10, h: 24, lt: 0, lb: 0, st: 0, ct: 0, cb: 0, n: 2.5 };
const open = (e: Partial<Eye>) => ({ ...flat, ...e });
const smile = open({ w: 13, h: 17, cb: 12, n: 2.2 });
const half = open({ w: 11, h: 22, lt: 0.44, ct: -1.5 });
const shut = open({ w: 14, h: 12, lt: 0.5, lb: 0.5, cb: -6.4, ct: 4.6 });
const wide = open({ w: 13.5, h: 27, n: 2.2 });
const low = open({ w: 9.5, h: 20, lt: 0.14 });
// Each feeling is only numbers: the left eye, the right, where they look, and how big the glint is.
const feelings: Record<string, { l: Eye; r: Eye; gaze?: Point; glint?: number }> = {
  bright: { l: flat, r: flat },
  happy: { l: smile, r: smile, glint: 0 },
  calm: { l: half, r: half },
  focus: { l: open({ w: 11, h: 22, lt: 0.17, st: 1.3 }), r: open({ w: 11, h: 22, lt: 0.17, st: -1.3 }) },
  doubt: { l: half, r: open({ h: 25 }), gaze: [3, 0] },
  wow: { l: wide, r: wide, glint: 1.35 },
  shy: { l: low, r: low, gaze: [-4, 3.5] },
  wink: { l: flat, r: smile },
  asleep: { l: shut, r: shut, glint: 0 },
};

// One eye as one outline. w and h are its size, lt and lb how far its lids have come in, st the top lid's slant, ct its
// sag, cb how far the bottom lid bows up for a smile, and n how square it is.
export function eye(cx: number, cy: number, { w, h, lt, lb, st, ct, cb, n }: Eye) {
  const [hw, hh] = [w / 2, h / 2];
  const points = Array.from({ length: 40 }, (_, i): Point => {
    const t = (i / 40) * 2 * Math.PI, [c, s] = [Math.cos(t), Math.sin(t)];
    const x = hw * Math.sign(c) * Math.abs(c) ** (2 / n), u = x / hw;
    const y = hh * Math.sign(s) * Math.abs(s) ** (2 / n);
    const [top, bottom] = [-hh + lt * h + st * u + ct * (1 - u * u), hh - lb * h - cb * (1 - u * u)];
    return [cx + x, cy + (top > bottom ? (top + bottom) / 2 : Math.min(bottom, Math.max(top, y)))];
  });
  return smooth(points);
}

// A closed curve through the points: Catmull-Rom segments as cubic Béziers.
function smooth(points: Point[]) {
  const at = (i: number) => points[(i + points.length) % points.length];
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

// Where a shape's outline crosses a row or a column, so what's worn can be cut to it.
const crossing = (points: Point[], axis: 0 | 1, at: number): Point | null => {
  const hits: number[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if ((a[axis] - at) * (b[axis] - at) <= 0 && a[axis] !== b[axis]) hits.push(a[1 - axis] + ((at - a[axis]) / (b[axis] - a[axis])) * (b[1 - axis] - a[1 - axis]));
  });
  return hits.length ? [Math.min(...hits), Math.max(...hits)] : null;
};

const known = new Map<string, { points: Point[]; d: string }>();
function outline(shape: string) {
  let found = known.get(shape);
  if (!found) {
    const numbers = (outlines[shape] ?? outlines.circle).points.split(" ").map(Number);
    const points = Array.from({ length: numbers.length / 2 }, (_, i): Point => [numbers[2 * i], numbers[2 * i + 1]]);
    known.set(shape, (found = { points, d: smooth(points) }));
  }
  return found;
}

// Where a look's eyes go at a size. At 28 pixels and under it's drawn again, bolder, with no fine lines.
export function layout({ shape, face }: Look, size: number) {
  const { face: [cx, cy], gap: wide } = outlines[shape] ?? outlines.circle, small = size <= 28;
  const [gap, k] = face === "glasses" ? [25, 0.84] : face === "shades" ? [24, 0.62] : small ? [wide ? wide + 2 : 23, wide ? 0.98 : 1.14] : [wide ?? 21, wide ? 0.86 : 1];
  return { cx, cy, gap, k, small };
}

// A feeling at a look's size. `glint` is the glint's radius.
export function feeling(mood: string, k: number) {
  const { l, r, gaze = [0, 0] as Point, glint = 1 } = feelings[mood] ?? feelings.bright;
  const sized = (e: Eye) => ({ ...e, w: e.w * k, h: e.h * k, st: e.st * k, ct: e.ct * k, cb: e.cb * k });
  return { l: sized(l), r: sized(r), gaze, glint: glint * 2.3 };
}
export const glintAt = (x: number, cy: number, e: Eye) => [x - e.w * 0.14, cy - e.h * 0.24 + e.lt * e.h * 0.5];
export const glintShows = (e: Eye) => Math.min(1, Math.max(0, 1.6 - e.lt * 4 - e.cb / 3));

// A hat would cover the eyes of a shape that has them at its top. Headphones go around them.
export const fits = (shape: string, head: string) => head === "none" || head === "headphones" || !outlines[shape]?.hatless;

const line = (d: string, color: string, width: number, more = "") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${more}/>`;
const shape = (d: string, color: string) => `<path d="${d}" fill="${color}"/>`;

// What a look wears, in layers: `under` the eyes, the `lens` behind them, and over them the `frame` and `over`.
function worn(look: Look, id: string, points: Point[], crown: number, small: boolean, gap: number) {
  const { face, outfit, tint = "own" } = look, [cx, cy] = (outlines[look.shape] ?? outlines.circle).face;
  const head = fits(look.shape, look.head ?? "none") ? look.head : "none";
  const tone = tones[look.color] ?? tones.brown;
  const [hi, mid, lo] = tint === "black" ? ["var(--blob-ink-hi)", "var(--blob-ink)", "var(--blob-ink-lo)"] : tint === "white" ? ["#fff", "#f4f4f4", "#cfcfcf"] : tone.slice(3, 6);
  const [accent, shadow] = tone.slice(6);
  const paper = "#fff", paperLo = "#c9c9c9", eyes = small ? 27 : 24;
  const bottom = crossing(points, 0, cx)?.[1] ?? 91, sides = crossing(points, 1, cy) ?? [10, 90];
  const yh = Math.max(crown + 11, cy - eyes / 2 - 8), ny = Math.max(cy + 15, Math.min(cy + 19, bottom - 15));
  const hx = crossing(points, 1, yh) ?? [cx - 30, cx + 30];
  const cut = (inner: string) => `<g mask="url(#${id}m)">${inner}</g>`;
  const clip = (inner: string) => `<g clip-path="url(#${id}c)">${inner}</g>`;
  const cast = (d: string, width: number, dy = 2.5, opacity = 0.2) => (small ? "" : clip(`<path d="${d}" fill="none" stroke="${shadow}" stroke-width="${width}" opacity="${opacity}" filter="url(#${id}s)" transform="translate(0 ${dy})"/>`));
  const cloth = `url(#${id}i)`, card = `url(#${id}p)`;
  const hatEdge = `M-10 ${yh - 5}Q${cx} ${yh + 7} 110 ${yh - 5}`, above = `${hatEdge}V-30H-10Z`;
  const neckEdge = `M-10 ${ny - 5}Q${cx} ${ny + 7} 110 ${ny - 5}`, below = `${neckEdge}V130H-10Z`;
  let under = "", lens = "", frame = "", over = "";

  if (outfit === "blazer") {
    const v = ny + Math.min(15, bottom - ny - 2);
    under += cast(neckEdge, 6, 1.5) + cut(shape(below, cloth) + shape(`M${cx - 12} ${ny - 2}L${cx} ${v}L${cx + 12} ${ny - 2}Q${cx} ${ny + 4} ${cx - 12} ${ny - 2}Z`, card) + (small ? "" : shape(`M${cx - 2.6} ${ny + 2.6}H${cx + 2.6}L${cx + 1.5} ${ny + 5.6}L${cx + 2.9} ${v - 3}L${cx} ${v}L${cx - 2.9} ${v - 3}L${cx - 1.5} ${ny + 5.6}Z`, accent) + line(`M${cx - 12} ${ny - 2}L${cx} ${v}M${cx + 12} ${ny - 2}L${cx} ${v}`, hi, 1.1)));
  }
  if (outfit === "turtleneck") {
    under += cast(neckEdge, 7, 0) + cut(shape(below, cloth) + shape(`M${cx - 22} ${ny - 4}Q${cx} ${ny + 1} ${cx + 22} ${ny - 4}L${cx + 23} ${ny + 3.5}Q${cx} ${ny + 9.5} ${cx - 23} ${ny + 3.5}Z`, hi) + (small ? "" : line(`M${cx - 23} ${ny + 3.5}Q${cx} ${ny + 9.5} ${cx + 23} ${ny + 3.5}`, lo, 0.9)));
  }
  if (outfit === "hoodie") {
    under += cast(neckEdge, 6, 1.5) + cut(shape(below, cloth) + shape(`M${cx - 20} ${ny - 3}Q${cx - 16} ${ny + 12} ${cx} ${ny + 12}Q${cx + 16} ${ny + 12} ${cx + 20} ${ny - 3}Q${cx} ${ny + 6} ${cx - 20} ${ny - 3}Z`, hi) + (small ? "" : line(`M${cx - 6} ${ny + 11}v9M${cx + 6} ${ny + 11}v7`, paper, 1.3)));
  }
  if (outfit === "scarf") {
    const a = ny - 3, tail = Math.max(cx - 4, Math.min(cx + 10, (crossing(points, 1, a + 7)?.[1] ?? cx + 34) - 17));
    under += cast(`M-10 ${a}Q${cx} ${a + 12} 110 ${a}`, 6, 1) + cut(shape(`M-10 ${a - 3}Q${cx} ${a + 9} 110 ${a - 3}V${a + 7}Q${cx} ${a + 19} -10 ${a + 7}Z`, cloth) + (small ? "" : line(`M-10 ${a + 2}Q${cx} ${a + 14} 110 ${a + 2}`, hi, 0.9)));
    under += cast(`M${tail + 7} ${a + 8}V${a + 24}`, 7, 1, 0.26) + shape(`M${tail} ${a + 8}Q${tail + 7} ${a + 9} ${tail + 14} ${a + 6}L${tail + 16} ${a + 24}Q${tail + 10} ${a + 26.5} ${tail + 4} ${a + 25}Z`, hi) + (small ? "" : line(`M${tail + 5.5} ${a + 25.4}v3M${tail + 9.5} ${a + 25.6}v3.2M${tail + 13.5} ${a + 24.8}v3`, hi, 1.2));
  }
  if (outfit === "bowtie") {
    const y = ny + 1.5, wing = (s: number) => `M${cx} ${y}C${cx + s * 5} ${y - 7} ${cx + s * 13} ${y - 8} ${cx + s * 15} ${y - 6.5}C${cx + s * 16.5} ${y - 3} ${cx + s * 16.5} ${y + 3} ${cx + s * 15} ${y + 6.5}C${cx + s * 13} ${y + 8} ${cx + s * 5} ${y + 7} ${cx} ${y}Z`;
    under += cast(`M${cx - 12} ${y}H${cx + 12}`, 6, 2, 0.28) + shape(wing(-1), cloth) + shape(wing(1), cloth) + (small ? "" : line(`M${cx - 4} ${y - 1}L${cx - 12} ${y - 3}M${cx - 4} ${y + 1}L${cx - 12} ${y + 3}M${cx + 4} ${y - 1}L${cx + 12} ${y - 3}M${cx + 4} ${y + 1}L${cx + 12} ${y + 3}`, hi, 0.9)) + `<rect x="${cx - 3.2}" y="${y - 3.8}" width="6.4" height="7.6" rx="2.6" fill="${hi}"/>`;
  }
  if (outfit === "badge") {
    const [w, h] = [21, 15], y = Math.min(ny - 2, bottom - h - 4), x = Math.max(cx - w / 2, Math.min(cx + 8, (crossing(points, 1, y + h / 2)?.[1] ?? cx + 34) - w - 3)), turn = `transform="rotate(-4 ${x + w / 2} ${y + h / 2})"`;
    under += cast(`M${x} ${y + h}H${x + w}`, 4, 1.5, 0.3) + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.4" fill="${card}" ${turn}/>` + (small ? "" : `<g ${turn}>${shape(`M${x} ${y + 3.6}V${y + 2.4}a2.4 2.4 0 0 1 2.4 -2.4H${x + w - 2.4}a2.4 2.4 0 0 1 2.4 2.4V${y + 3.6}Z`, accent)}<rect x="${x + 3}" y="${y + 6}" width="${w - 6}" height="1.5" rx=".75" fill="${paperLo}"/><rect x="${x + 3}" y="${y + 8.9}" width="${w - 9}" height="1.5" rx=".75" fill="${paperLo}"/></g>`);
  }

  const eyesAt = [cx - gap / 2, cx + gap / 2];
  if (face === "glasses") {
    const [w, h] = [gap - 2, 27], box = (x: number) => `<rect x="${x - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * 0.46}"`;
    lens += eyesAt.map((x) => `${box(x)} fill="#fff" fill-opacity="${look.color === "black" ? 0.08 : 0.28}"/>`).join("");
    frame += eyesAt.map((x) => `${box(x)} fill="none" stroke="${mid}" stroke-width="${small ? 3 : 1.9}"/>` + (small ? "" : line(`M${x - w * 0.26} ${cy - h * 0.2}L${x - w * 0.14} ${cy - h * 0.31}`, "#fff", 1.3, 'opacity=".7"'))).join("");
    if (!small) frame += clip(line(`M${eyesAt[0] - w / 2} ${cy - 3}H${sides[0] - 3}M${eyesAt[1] + w / 2} ${cy - 3}H${sides[1] + 3}`, mid, 2.1));
  }
  if (face === "shades") {
    const [w, h] = [gap - 1, 19], y = cy - 1;
    frame += eyesAt.map((x) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h * 0.38}" fill="${cloth}" fill-opacity=".93"/>` + (small ? "" : line(`M${x - w * 0.26} ${y - h * 0.02}L${x - w * 0.04} ${y - h * 0.26}`, "#fff", 1.6, 'opacity=".6"'))).join("");
    frame += line(`M${cx - 2} ${y - 4}Q${cx} ${y - 6} ${cx + 2} ${y - 4}`, mid, 2.4);
    if (!small) frame += clip(line(`M${eyesAt[0] - w / 2} ${y - 3}H${sides[0] - 3}M${eyesAt[1] + w / 2} ${y - 3}H${sides[1] + 3}`, mid, 2.1));
  }
  if (face === "mustache") {
    const y = Math.min(cy + eyes / 2 + 7, bottom - 8), row = crossing(points, 1, y + 3) ?? [cx - 21, cx + 21], fit = Math.min(1, (Math.min(cx - row[0], row[1] - cx) - 1) / 20);
    const half = (s: number) => `C${cx + s * 1} ${y + 2} ${cx + s * 3} ${y + 3} ${cx + s * 5} ${y + 4}C${cx + s * 11} ${y + 7} ${cx + s * 20} ${y + 6.4} ${cx + s * 19.5} ${y + 0.6}C${cx + s * 19} ${y + 2.6} ${cx + s * 16} ${y + 3.5} ${cx + s * 14} ${y + 0.5}C${cx + s * 11} ${y - 5} ${cx + s * 3} ${y - 6} ${cx} ${y - 2.6}`;
    frame += shape(`M${cx} ${y + 0.6}${half(fit)}${half(-fit)}Z`, cloth);
  }

  if (head === "beanie") {
    const ribs = small ? "" : Array.from({ length: 15 }, (_, i) => { const x = cx - 42 + i * 6; return line(`M${x} ${yh - 10.5 + 5.6 * (1 - ((x - cx) / 60) ** 2)}v5.4`, lo, 0.9); }).join("");
    over += cast(hatEdge, 7) + cut(shape(above, cloth) + shape(`M-10 ${yh - 12}Q${cx} ${yh} 110 ${yh - 12}V${yh - 5}Q${cx} ${yh + 7} -10 ${yh - 5}Z`, hi) + ribs) + `<circle cx="${cx}" cy="${crown - 2.5}" r="${small ? 7 : 6}" fill="${cloth}"/>`;
  }
  if (head === "cap") {
    const right = hx[1];
    over += cast(`M${hx[0]} ${yh + 2}Q${cx} ${yh + 8} ${right + 6} ${yh + 4}`, 6) + cut(shape(above, cloth) + (small ? "" : line(`M${cx} ${crown}Q${cx - 13} ${yh - 7} ${cx - 16} ${yh + 1}`, hi, 1) + line(`M${cx} ${crown}Q${cx + 13} ${yh - 7} ${cx + 16} ${yh + 1}`, hi, 1)));
    over += shape(`M${cx - 14} ${yh + 1.8}C${cx + 2} ${yh + 5.6} ${right - 6} ${yh + 3.6} ${right + 5} ${yh - 1.5}C${right + 10} ${yh + 0.5} ${right + 9} ${yh + 5} ${right + 3} ${yh + 7}C${right - 10} ${yh + 11.5} ${cx - 4} ${yh + 11} ${cx - 14} ${yh + 1.8}Z`, hi);
    if (!small) over += `<circle cx="${cx}" cy="${crown + 1.2}" r="2" fill="${hi}"/>`;
  }
  if (head === "beret") {
    const hw = Math.min(40, (hx[1] - hx[0]) / 2 + 7), y = crown + 7;
    over += cast(`M${cx - hw + 4} ${y + 8}Q${cx} ${y + 15} ${cx + hw - 4} ${y + 8}`, 6, 2);
    over += shape(`M${cx - hw} ${y + 2}C${cx - hw - 1} ${y - 11} ${cx - 10} ${y - 15} ${cx + 8} ${y - 13}C${cx + 26} ${y - 11} ${cx + hw + 5} ${y - 1} ${cx + hw - 1} ${y + 7}C${cx + hw - 12} ${y + 13} ${cx - hw + 8} ${y + 14} ${cx - hw} ${y + 2}Z`, cloth);
    if (!small) over += line(`M${cx - hw + 6} ${y + 7.5}Q${cx} ${y + 13} ${cx + hw - 5} ${y + 7}`, hi, 1.1);
    over += line(`M${cx + 3} ${y - 13}q.4 -3.4 2.4 -5.2`, mid, small ? 3.4 : 2.4);
  }
  if (head === "headband") {
    const a = yh - 1, r = hx[1];
    over += cast(`M-10 ${a - 3}Q${cx} ${a + 7} 110 ${a - 3}`, 6, 3) + cut(shape(`M-10 ${a - 7}Q${cx} ${a + 3} 110 ${a - 7}V${a + 1}Q${cx} ${a + 11} -10 ${a + 1}Z`, cloth) + (small ? "" : line(`M-10 ${a - 3}Q${cx} ${a + 7} 110 ${a - 3}`, hi, 0.9)));
    if (!small) over += shape(`M${r - 3} ${a - 4}C${r + 3} ${a - 9} ${r + 10} ${a - 9} ${r + 13} ${a - 6}C${r + 9} ${a - 5} ${r + 8} ${a - 3} ${r + 9} ${a}C${r + 5} ${a + 1} ${r + 1} ${a} ${r - 3} ${a - 4}Z`, hi);
  }
  if (head === "swoop") {
    over += cast(`M${hx[0] - 4} ${yh + 4}C${cx - 18} ${yh - 2} ${cx - 8} ${yh - 8} ${cx + 6} ${yh - 7}C${cx + 18} ${yh - 6} ${cx + 26} ${yh + 1} ${hx[1] + 6} ${yh + 9}`, 6);
    over += cut(shape(`M-10 ${yh + 8}C${cx - 24} ${yh + 4} ${cx - 12} ${yh - 9} ${cx + 4} ${yh - 8}C${cx + 18} ${yh - 7} ${cx + 26} ${yh + 3} 110 ${yh + 16}V-30H-10Z`, cloth) + (small ? "" : line(`M${cx - 14} ${crown + 9}C${cx - 2} ${crown + 5} ${cx + 12} ${crown + 9} ${cx + 22} ${yh - 2}`, hi, 1.1)));
    over += shape(`M${cx - 6} ${crown + 3}C${cx - 2} ${crown - 7} ${cx + 8} ${crown - 8} ${cx + 13} ${crown - 3}C${cx + 8} ${crown - 3} ${cx + 5} ${crown} ${cx + 4} ${crown + 4}Z`, cloth);
  }
  if (head === "headphones") {
    const [l, r] = [sides[0] - 1.5, sides[1] + 1.5], y = cy - 3, control = y + ((crown - 4 - y) * 4) / 3;
    const cup = (x: number, side: number) => `<rect x="${x - 5.6}" y="${cy - 12}" width="11.2" height="22" rx="5.2" fill="${cloth}"/>` + (small ? "" : `<rect x="${x - side * 2.4 - 1.5}" y="${cy - 8}" width="3" height="14" rx="1.5" fill="${hi}"/>`);
    over += line(`M${l} ${y}C${l} ${control} ${r} ${control} ${r} ${y}`, mid, small ? 5 : 3) + cast(`M${l + 5} ${cy - 10}V${cy + 8}M${r - 5} ${cy - 10}V${cy + 8}`, 5, 0, 0.3) + cup(l, -1) + cup(r, 1);
  }
  return { under, lens, frame, over, gradients: [hi, mid, lo] };
}

// The inside of a look's <svg>, with `id` keeping its definitions its own. Groups named blob-far and blob-mid shift as its
// head turns, and blob-anti and blob-in keep what's cut to the body in place while it does.
export function drawBlob(look: Look, mood: string, size: number, id: string) {
  const { points, d } = outline(look.shape), { cx, cy, gap, k, small } = layout(look, size);
  const tone = tones[look.color] ?? tones.brown, light = look.color === "black";
  const crown = (outlines[look.shape] ?? outlines.circle).crown ?? crossing(points, 0, cx)?.[0] ?? 9;
  const { under, lens, frame, over, gradients: [hi, mid, lo] } = worn(look, id, points, crown, small, gap);
  const { l, r, glint } = feeling(mood, k), ink = light ? "#fafafa" : "#171717";
  const anchored = (svg: string) => svg.replace(/<g (mask|clip-path)="([^"]*)">([\s\S]*?)<\/g>/g, '<g $1="$2" class="blob-anti"><g class="blob-in">$3</g></g>');
  const one = (side: string, x: number, e: Eye) => {
    const [gx, gy] = glintAt(x, cy, e);
    return `<path class="blob-eye blob-eye-${side}" d="${eye(x, cy, e)}" fill="${ink}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>` + (small || light ? "" : `<circle class="blob-glint-${side}" cx="${f(gx)}" cy="${f(gy)}" r="${glint || 0.01}" fill="#fff" opacity="${glintShows(e)}"/>`);
  };
  const stem = look.shape === "pumpkin" ? line(`M${cx - 1} ${crown + 4}C${cx - 2} ${crown - 3} ${cx + 1} ${crown - 8} ${cx + 7} ${crown - 9}`, tone[4], 4.5) : "";
  const stop = (offset: number | string, color: string) => `<stop offset="${offset}" style="stop-color:${color}"/>`;
  return `<defs><clipPath id="${id}c"><path d="${d}"/></clipPath><mask id="${id}m" maskUnits="userSpaceOnUse" x="-30" y="-30" width="160" height="160"><path d="${d}" fill="#fff" stroke="#fff" stroke-width="3.4"/></mask><linearGradient id="${id}g" x1=".15" y1="0" x2=".85" y2="1">${stop(0, tone[0])}${stop(0.58, tone[1])}${stop(1, tone[2])}</linearGradient><linearGradient id="${id}i" x1="0" y1="0" x2=".5" y2="1">${stop(0, hi)}${stop(0.55, mid)}${stop(1, lo)}</linearGradient><linearGradient id="${id}p" x1="0" y1="0" x2=".5" y2="1">${stop(0, "#fff")}${stop(1, "#e4e4e4")}</linearGradient><filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter><filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter></defs><g class="blob-body"><g class="blob-lean">${stem}<g clip-path="url(#${id}c)"><rect x="-20" y="-20" width="140" height="140" fill="url(#${id}g)"/><ellipse class="blob-shine" cx="33" cy="${crown + 17}" rx="25" ry="15" fill="#fff" opacity="${light ? 0.16 : 0.55}" filter="url(#${id}b)"/></g>${light ? `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/>` : ""}<g class="blob-far">${anchored(under)}</g><g class="blob-mid">${anchored(lens)}</g><g class="blob-eyes">${one("l", cx - gap / 2, l)}${one("r", cx + gap / 2, r)}</g><g class="blob-mid">${anchored(frame)}</g><g class="blob-far">${anchored(over)}</g></g></g>`;
}
