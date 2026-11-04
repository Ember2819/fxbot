// A plugin's icon, Bloom: a soft shape on a tinted tile, both in the plugin's two hues, drawn from its key,
// `creator/name`. The key seeds every value, so each plugin has a look of its own and keeps it everywhere. Every number
// here is part of each plugin's look: changing one changes every icon. packages/website/src/plugin-icon.ts is a copy.

export type PluginIcon = { path: string; turn: number; light: Tones; dark: Tones };
// The tile's two stops, then the shape's two.
export type Tones = [tile: string, tile2: string, ink: string, ink2: string];

// 32-bit FNV-1a of the lowercased key seeds mulberry32, so keys a letter apart draw unrelated values.
export function iconSeed(key: string) {
  key = key.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// OKLCH to sRGB, before gamma.
function linear(L: number, C: number, h: number) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const fits = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
// An OKLCH color as hex, its chroma lowered until it fits sRGB. Yellows and greens are lifted a little, or they read
// as olive beside the other hues at the same lightness.
function hex([L, C]: readonly [number, number], h: number, lifted: boolean) {
  if (lifted) L = Math.min(0.95, L + 0.07 * Math.max(0, 1 - Math.abs(((h - 100 + 540) % 360) - 180) / 55));
  let c = C;
  if (!fits(linear(L, c, h))) {
    let [lo, hi] = [0, C];
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(linear(L, mid, h))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const byte = (v: number) => {
    v = Math.min(1, Math.max(0, v));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, "0");
  };
  return "#" + linear(L, c, h).map(byte).join("");
}

// Lightness and chroma: the tile's two stops, then the shape's two, for each theme.
const tones = {
  light: [[0.962, 0.03], [0.935, 0.04], [0.7, 0.15], [0.8, 0.125]],
  dark: [[0.3, 0.05], [0.265, 0.045], [0.7, 0.14], [0.79, 0.11]],
} as const;

// A closed curve through the points, as Catmull-Rom segments in cubic Béziers.
function curve(points: [number, number][]) {
  const n = points.length, f = (v: number) => v.toFixed(2);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

// The values are drawn in this order. The shape is a circle bent by two waves in its radius, from a rounded triangle to
// a seven-petal flower, scaled so its widest point is 33 from the middle of a 100 by 100 tile.
export function pluginIcon(key: string): PluginIcon {
  const r = random(iconSeed(key));
  const hue = r() * 360;
  const spread = (26 + r() * 38) * (r() < 0.5 ? -1 : 1);
  const hue2 = (hue + spread + 360) % 360;
  const lobes = 3 + Math.floor(r() * 5);
  const harmonic = lobes + 1 + Math.floor(r() * 4);
  const [a1, a2, p1, p2, turn] = [0.06 + r() * 0.14, r() * 0.06, r() * 2 * Math.PI, r() * 2 * Math.PI, r() * 360];
  const radii = Array.from({ length: 48 }, (_, k) => {
    const t = (k / 48) * 2 * Math.PI;
    return [t, 1 + a1 * Math.cos(lobes * t + p1) + a2 * Math.cos(harmonic * t + p2)];
  });
  const scale = 33 / Math.max(...radii.map(([, radius]) => radius));
  const path = curve(radii.map(([t, radius]): [number, number] => [50 + radius * scale * Math.cos(t), 50 + radius * scale * Math.sin(t)]));
  const paint = (set: (typeof tones)["light" | "dark"]): Tones => [hex(set[0], hue, false), hex(set[1], hue2, false), hex(set[2], hue, true), hex(set[3], hue2, true)];
  return { path, turn: Math.round(turn * 10) / 10, light: paint(tones.light), dark: paint(tones.dark) };
}
