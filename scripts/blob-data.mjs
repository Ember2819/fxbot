// Writes packages/ui/src/blob-data.ts, each shape's outline and each color's tones, and copies it and blob-draw.ts to the
// site, which imports nothing from the app. Run it after changing a shape or a color: node scripts/blob-data.mjs
import { copyFileSync, writeFileSync } from "node:fs";

const file = (path) => new URL(`../packages/${path}`, import.meta.url);
const n1 = (n) => +n.toFixed(1);
const ring = (count, point) => Array.from({ length: count }, (_, i) => point((i / count) * 2 * Math.PI));
const polar = (radius) => ring(360, (t) => [radius(t) * Math.cos(t), radius(t) * Math.sin(t)]);
const corners = (sides) => ring(sides, (t) => [Math.sin(t), -Math.cos(t)]);
const lobes = (count, base, power = 1) => (t) => base + (1 - base) * ((1 + Math.cos(count * t)) / 2) ** power;

// `count` points spaced evenly along a closed outline.
function even(points, count) {
  const n = points.length, along = [0];
  for (let i = 1; i <= n; i++) along.push(along[i - 1] + Math.hypot(points[i % n][0] - points[i - 1][0], points[i % n][1] - points[i - 1][1]));
  const out = [];
  for (let k = 0, j = 0; k < count; k++) {
    const at = (k / count) * along[n];
    while (along[j + 1] < at) j++;
    const [a, b] = [points[j], points[(j + 1) % n]];
    const t = (at - along[j]) / (along[j + 1] - along[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
// Each pass moves every point toward its neighbours, which rounds corners and leaves straight edges straight.
function soften(points, passes) {
  const at = (list, i) => list[(i + list.length) % list.length];
  for (let pass = 0; pass < passes; pass++) points = points.map(([x, y], i) => [(at(points, i - 1)[0] + 2 * x + at(points, i + 1)[0]) / 4, (at(points, i - 1)[1] + 2 * y + at(points, i + 1)[1]) / 4]);
  return points;
}
// Stretched, turned by `turn` degrees, then scaled and centred so the larger side spans 82 of the 100.
function fit(points, turn, sx, sy) {
  const a = (turn * Math.PI) / 180;
  const moved = points.map(([x, y]) => [x * sx * Math.cos(a) - y * sy * Math.sin(a), x * sx * Math.sin(a) + y * sy * Math.cos(a)]);
  const [xs, ys] = [moved.map((p) => p[0]), moved.map((p) => p[1])];
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
  const scale = 82 / Math.max(width, height);
  return moved.map(([x, y]) => [50 + (x - left - width / 2) * scale, 50 + (y - top - height / 2) * scale]);
}
// The middle of the area, where the eyes go, so they sit inside a triangle as well as a circle.
function centroid(points) {
  let [area, x, y] = [0, 0, 0];
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    [area, x, y] = [area + cross, x + (x0 + x1) * cross, y + (y0 + y1) * cross];
  });
  return [x / (3 * area), y / (3 * area)];
}
function outline(start, { round = 0, turn = 0, sx = 1, sy = 1, lower = 0, face, count = 64, crown, gap, hatless } = {}) {
  const points = even(fit(soften(even(start, 160), round), turn, sx, sy), count);
  const [cx, cy] = centroid(points);
  return { points, face: face ?? [cx, cy + lower], crown, gap, hatless };
}

// The new shapes are smooth unions of simple forms, so ears melt into heads, traced by marching squares.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ellipse = (cx, cy, a, b, rot = 0) => (x, y) => {
  const t = (rot * Math.PI) / 180, [dx, dy] = [x - cx, y - cy];
  return (Math.hypot((dx * Math.cos(t) + dy * Math.sin(t)) / a, (-dx * Math.sin(t) + dy * Math.cos(t)) / b) - 1) * Math.min(a, b);
};
const box = (cx, cy, w, h, r) => (x, y) => {
  const [qx, qy] = [Math.abs(x - cx) - w + r, Math.abs(y - cy) - h + r];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const capsule = (ax, ay, bx, by, r) => (x, y) => {
  const [px, py, vx, vy] = [x - ax, y - ay, bx - ax, by - ay];
  const h = clamp((px * vx + py * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - vx * h, py - vy * h) - r;
};
const poly = (pts, r = 0) => (x, y) => {
  let d = Infinity, s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[j], [ex, ey, wx, wy] = [bx - ax, by - ay, x - ax, y - ay];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    const [c1, c2, c3] = [y >= ay, y < by, ex * wy > ey * wx];
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * d - r;
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const join = (k, ...forms) => (x, y) => forms.map((form) => form(x, y)).reduce((a, b) => smin(a, b, k));
const meet = (k, a, b) => (x, y) => -smin(-a(x, y), -b(x, y), k);
function trace(form, n = 260, lo = -30, hi = 130) {
  const s = (hi - lo) / n, W = n + 1, g = new Float64Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) g[j * W + i] = form(lo + i * s, lo + j * s);
  const pos = new Map(), adj = new Map();
  const edge = (i, j, d) => {
    const k = (j * W + i) * 2 + d;
    if (!pos.has(k)) {
      const [a, b] = d === 0 ? [g[j * W + i], g[j * W + i + 1]] : [g[j * W + i], g[(j + 1) * W + i]];
      const t = a / (a - b);
      pos.set(k, d === 0 ? [lo + (i + t) * s, lo + j * s] : [lo + i * s, lo + (j + t) * s]);
    }
    return k;
  };
  const link = (a, b) => { (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [g[j * W + i] < 0, g[j * W + i + 1] < 0, g[(j + 1) * W + i + 1] < 0, g[(j + 1) * W + i] < 0];
    const e = [];
    if (a !== b) e.push(edge(i, j, 0));
    if (b !== c) e.push(edge(i + 1, j, 1));
    if (d !== c) e.push(edge(i, j + 1, 0));
    if (a !== d) e.push(edge(i, j, 1));
    if (e.length === 2) link(e[0], e[1]);
    else if (e.length === 4) { link(e[0], e[3]); link(e[1], e[2]); }
  }
  const seen = new Set();
  let best = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let at = start, prev = -1;
    while (at !== undefined && !seen.has(at)) {
      seen.add(at);
      loop.push(pos.get(at));
      const next = adj.get(at).find((v) => v !== prev && !seen.has(v));
      prev = at;
      at = next;
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}
const built = (form, options = {}) => outline(trace(form), { round: 6, count: 88, ...options });

const heart = ring(240, (t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
const shapes = {
  circle: outline(polar(() => 1)),
  cloud: outline(polar((t) => 1 + 0.24 * Math.abs(Math.cos(2.5 * t))), { round: 2, turn: 18 }),
  squircle: outline(corners(4), { round: 70, turn: 57 }),
  star: outline(polar(lobes(4, 0.64, 1.2)), { round: 8, turn: 10 }),
  clover: outline(polar((t) => 0.68 + 0.32 * Math.abs(Math.cos(2 * t))), { round: 3, turn: 45 }),
  heart: outline(heart, { round: 8, turn: -10, lower: 7 }),
  flower: outline(polar((t) => 1 + 0.13 * Math.cos(8 * t)), { round: 1 }),
  egg: outline(polar((t) => 1 + 0.15 * Math.sin(t)), { turn: -16, sy: 1.08 }),
  bean: outline([[-1.5, -1], [1.5, -1], [1.5, 1], [-1.5, 1]], { round: 160, turn: -8 }),
  triangle: outline(corners(3), { round: 90, turn: -6 }),
  diamond: outline(corners(4), { round: 60, turn: 12, sy: 1.18 }),
  sparkle: outline(polar(lobes(6, 0.64, 1.4)), { round: 3 }),
  hexagon: outline(corners(6), { round: 45, turn: 30 }),
  pumpkin: outline(polar((t) => 1 - 0.18 * Math.abs(Math.sin(t)) ** 12), { round: 2, sx: 1.3 }),
  mochi: built(join(10, ellipse(50, 58, 43, 30), box(50, 72, 38, 14, 12)), { face: [50, 55] }),
  gumdrop: built(meet(10, circle(50, 64, 45), box(50, 54, 60, 34, 0)), { face: [50, 56] }),
  toast: built(join(8, box(50, 62, 33, 29, 9), circle(30, 34, 17.5), circle(70, 34, 17.5), circle(50, 30, 20)), { face: [50, 52] }),
  arch: built(join(2, circle(50, 42, 33), box(50, 66, 33, 26, 8)), { face: [50, 50] }),
  pill: built(box(50, 50, 27, 44, 27), { face: [50, 46] }),
  drop: built(join(26, circle(50, 62, 32), poly([[35, 42], [65, 42], [50, 2]], 1)), { face: [50, 60] }),
  peanut: built(join(9, circle(50, 33, 26), circle(50, 69, 30)), { face: [50, 37] }),
  puff: built(join(4, circle(50, 52, 28), ...ring(9, (t) => circle(50 + 33 * Math.sin(t), 52 - 32 * Math.cos(t), 13.5))), { round: 3, face: [50, 52] }),
  mushroom: built(join(6, meet(8, ellipse(50, 44, 45, 34), box(50, 34, 60, 28, 0)), box(50, 72, 21, 21, 11)), { face: [50, 42] }),
  bear: built(join(5, ellipse(50, 58, 38, 34), circle(20, 26, 13), circle(80, 26, 13)), { face: [50, 58] }),
  cat: built(join(7, ellipse(50, 60, 39, 32), poly([[17, 46], [20, 10], [46, 32]], 3), poly([[83, 46], [80, 10], [54, 32]], 3)), { face: [50, 60] }),
  mouse: built(join(4, circle(50, 64, 30), circle(21, 32, 19), circle(79, 32, 19)), { face: [50, 65] }),
  bunny: built(join(9, ellipse(50, 68, 33, 28), capsule(37, 46, 32, 9, 9), capsule(63, 46, 68, 9, 9)), { face: [50, 67] }),
  frog: built(join(8, ellipse(50, 64, 44, 28), circle(27, 37, 15.5), circle(73, 37, 15.5)), { face: [50, 40], gap: 46, hatless: true }),
  imp: built(join(9, ellipse(50, 58, 37, 35), poly([[28, 32], [22, 6], [44, 24]], 2), poly([[72, 32], [78, 6], [56, 24]], 2)), { face: [50, 58] }),
  bot: built(join(2, box(50, 60, 37, 31, 13), capsule(50, 30, 50, 14, 2.4), circle(50, 11, 6), box(11, 60, 3.4, 8, 3), box(89, 60, 3.4, 8, 3)), { round: 3, face: [50, 60], crown: 30 }),
  ghost: built(join(5, circle(50, 42, 33), box(50, 62, 33, 22, 3), circle(28, 84, 11), circle(50, 86, 11), circle(72, 84, 11)), { face: [50, 48] }),
  sprout: built(join(4, ellipse(50, 62, 37, 33), capsule(50, 32, 50, 18, 2.6), ellipse(36, 13, 13, 6.6, 18), ellipse(64, 13, 13, 6.6, -18)), { face: [50, 62], crown: 30 }),
};

// Three stops of the body, by OKLCH lightness, chroma, and hue.
const hues = {
  black: [[0.46, 0.006, 260], [0.33, 0.006, 260], [0.22, 0.004, 260]],
  brown: [[0.86, 0.05, 68], [0.73, 0.085, 60], [0.6, 0.095, 50]],
  red: [[0.92, 0.05, 10], [0.8, 0.12, 10], [0.7, 0.165, 12]],
  orange: [[0.9, 0.06, 55], [0.8, 0.125, 42], [0.72, 0.16, 30]],
  amber: [[0.95, 0.09, 98], [0.88, 0.14, 88], [0.8, 0.16, 72]],
  green: [[0.95, 0.09, 122], [0.87, 0.15, 132], [0.78, 0.16, 148]],
  teal: [[0.93, 0.06, 170], [0.84, 0.11, 178], [0.75, 0.125, 192]],
  blue: [[0.92, 0.05, 225], [0.8, 0.105, 238], [0.69, 0.145, 250]],
  purple: [[0.91, 0.05, 280], [0.78, 0.105, 278], [0.67, 0.15, 276]],
  pink: [[0.92, 0.055, 330], [0.8, 0.12, 332], [0.7, 0.165, 338]],
  gray: [[0.9, 0.012, 255], [0.76, 0.02, 255], [0.62, 0.028, 258]],
};
const hex = ([l, c, h]) => {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
  return "#" + linear.map((v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))).toString(16).padStart(2, "0")).join("");
};
// A body's stops, then what it wears in its own color (light, middle, dark), an accent, and the shade worn things cast.
const tones = Object.fromEntries(Object.entries(hues).map(([name, stops]) => {
  const [l, c, h] = stops[2];
  const worn = name === "black" ? ["#6b6b6b", "#505050", "#3a3a3a"] : [hex([0.5, c * 0.82, h]), hex([0.41, c * 0.8, h]), hex([0.33, c * 0.7, h])];
  return [name, [...stops.map(hex), ...worn, hex([Math.max(0.56, l - 0.08), c * 1.05, h]), hex([Math.max(0.12, l - 0.3), c * 0.7, h])]];
}));

const rows = Object.entries(shapes).map(([name, { points, face, crown, gap, hatless }]) => {
  const extra = `${crown ? `, crown: ${crown}` : ""}${gap ? `, gap: ${gap}` : ""}${hatless ? ", hatless: true" : ""}`;
  return `  ${name}: { face: [${face.map(n1).join(", ")}]${extra}, points: "${points.map(([x, y]) => `${n1(x)} ${n1(y)}`).join(" ")}" },`;
});
writeFileSync(file("ui/src/blob-data.ts"), `// Written by scripts/blob-data.mjs: run it to change a shape or a color. packages/website/src/blob-data.ts is a copy.

// Each shape's outline in a 100 by 100 box, where its eyes go, where a hat sits if the top of it isn't the head, how far
// apart its eyes are if not the usual, and whether a hat would cover them.
export const outlines: Record<string, { face: [number, number]; crown?: number; gap?: number; hatless?: boolean; points: string }> = {
${rows.join("\n")}
};

// Each color: three stops of the body, what it wears in its own color (light, middle, dark), an accent, and a shadow.
export const tones: Record<string, string[]> = {
${Object.entries(tones).map(([name, list]) => `  ${name}: ${JSON.stringify(list)},`).join("\n")}
};
`);
for (const name of ["blob-data.ts", "blob-draw.ts"]) copyFileSync(file(`ui/src/${name}`), file(`website/src/${name}`));
console.log(`${rows.length} shapes, ${Object.keys(tones).length} colors`);
console.log(Object.entries(tones).map(([name, list]) => `  ${name}: "${list[1]}",`).join("\n"));
