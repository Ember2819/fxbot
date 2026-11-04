# Plugin icons

Every plugin gets an icon that's its own: a soft shape on a tinted tile, in two hues, drawn from the plugin's creator and name. The same plugin looks the same everywhere: in **Plugins**, in Settings, in the sidebar, and on [fxbot.sh's directory](plugin-directory.md). Nobody draws one, nothing is fetched, and there's no fixed list of looks: each key gets its own.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word; researched against the research directive's references. The owner's decisions:
- "Plugins need icons, auto generated, in the clean style we are keeping, keyed off their name+creator or something."
- Not a few fixed looks: "a nice dynamic generation… some unique color system that's super clean and easy on the eyes, but has a lot more variations and becomes almost a 'unique' signature of that plugin."
- **Bloom**, picked from a mockup of three generated styles (Bloom, Aura, and Facet) on 2026-11-04. [The look](#the-look-bloom) describes it, and [the generator](#the-generator) is its exact code.
- It's built before [the plugin directory](plugin-directory.md), which draws the same icons.

## 0. Core or plugin

**Core.** [Conventions](../../CONVENTIONS.md#core-or-plugin) put finding, vetting, and adding plugins in the core, and an icon is how a plugin shows where it's found and added.
- The icon is a function of one string. It needs no request, no stored image, no table, and no code from the plugin.
- The core names no plugin. The SDK gives every plugin its key by one rule, and the page draws it.
- The plugin API changes by one line: `app.nav` without an `icon` shows the plugin's icon, not the label's first letter.

## 1. Research

### fxbot today

- **Plugins show a letter, not an icon.** `Initial` (`packages/ui/src/mcp-add.tsx:76`) draws the title's first letter on a muted 36 px tile: "The plugin's initial, in place of a remote icon, which would tell its host who looked."
  - It's on Browse's cards and the add dialogs' heads: `mcp-add.tsx:100` and `:180`, `skills.tsx:59` and `:145`, `packages.tsx:170`, and `plugins-page.tsx:203`.
  - Installed rows have no icon at all (`plugins-page.tsx:171`).
- **fxbot's two packages share a letter.** The computer and chat rooms both show **C**.
- **The sidebar's footer** draws an `app.nav` button with its `icon`, or else `label.slice(0, 1)` (`packages/ui/src/app.tsx:332`). The `Nav` type is in `packages/ui/src/plugins.tsx:34`. Neither of fxbot's plugins calls `app.nav`; chat rooms uses `app.sidebar` (`plugins/chat-rooms/fxbot/page.jsx:417`).
- **Remote icons were turned down** in [add-ons](../_completed/phases/addons.md#5-open-questions): "not loaded, which avoids tracking and mixed content."
- **The bots' look** is 14 shapes in 11 colors: "A UI draws them; the names are the contract" (`packages/sdk/src/types.ts:3`).
  - `packages/ui/src/blob.tsx` draws each shape once, as one path in a 100×100 box, fitted to 82 of it, with white eyes over it.
  - The site has its own copy, `packages/website/src/blob.tsx`, "adapted from the app's", since it imports none of the other packages.
- **What fxbot knows about who made a plugin:**
  - **A package from GitHub:** `source.repo`, as `owner/repo` (`types.ts:171`).
  - **A package from `FXBOT_PLUGIN_DIRS`:** only its folder, `{ local }` (`packages/sdk/src/plugins.ts:248`). The owner's dev install loads the computer and chat rooms this way.
  - **An MCP server from a registry:** its entry's name, `namespace/name`. "`namespace` is its publisher, verified by the registry" (`types.ts`, above `RegistryInfo`).
  - **An MCP server added by address:** its host. Its name is what the server calls itself, or the host (`packages/sdk/src/mcp.ts:429`).
  - **A skill:** its skills.sh id, `owner/repo/skillId`.
  - A package's name is "up to 40 lowercase letters, digits, and dashes" (`plugins.ts:118`), and no two on one install share one (`plugins.ts:242` and `:796`).
- **fxbot's lists** already pair a creator with a name: the packages' `repo` (`packages/sdk/src/plugins-registry.json`), the servers' `name` (`mcp-registry.json`), and the skills' `source` and `skillId` (`skills-registry.json`).

### The references

- **OpenBot** (`CopilotKit/openbot`), the closest prior art:
  - **Bots** are drawn by boring-avatars, seeded by `avatarSeed`, which is the bot's id (`app/src/components/agents/abstract-avatar.tsx`, `server/src/agents/profile-store.ts:574`).
  - **Its orbs** pick one of 8 palettes by hash (`app/src/lib/orb-palette.ts`):
    - "A 32-bit FNV-1a hash spreads similar ids across the eight." The code is `Math.imul` over `charCodeAt`, then `>>> 0`, then a remainder.
    - "Never from its name, so renaming a Bot keeps its color."
    - "The order is part of the contract: a Bot's color is its index here, so reordering or inserting would recolor every Bot."
  - **An app without a logo** shows its initial (`app/src/components/plugins/plugin-logo.tsx`): "a list of apps that all show the same plug is a column of identical tiles, which tells nobody anything; 'T' and 'G' at least tell Todoist from GitHub at a glance."
  - **Vendor logos** are URLs from Composio's directory, kept on the server's row (`server/src/plugins/logos.ts`), and loaded with `referrerPolicy="no-referrer"`.
- **OpenDuet**: a channel's look is picked by hand, one of 24 line icons in one of 9 colors. "The names are what is stored. What each name draws is the app's" (`openbot/shared/channel-look.ts`).
- **OpenDots**: a specialist's mascot is one of 4 pictures, picked by a `hash * 31 + c` hash of its identity. "Stable identity keeps each specialist recognizable across views and reloads" (`src/client/Mascot.tsx`).
- **eve**: its docs' integrations gallery gives each entry a brand logo by key, from a 1,219-line `apps/docs/lib/integrations/logos.tsx`, mostly Simple Icons. Every entry must name one, and there's no fallback.
- **Pi**: its package gallery, pi.dev/packages, shows no icon on any of 5,648 packages' cards, or on a package's page (fetched today). `pi.image` and `pi.video` in `package.json` add previews (`packages/coding-agent/docs/packages.md`).
- **Grok Bot** (docs only): **Connect apps** is a catalog to "Browse or search", with **Installed**. The docs don't say whether entries show logos.
- **Nothing on icons:**
  - fx is a terminal app, with no icons.
  - fx0 shows the signed-in person's picture.
  - durable-harness, agent-browser, agent-desktop, and openmuse have no plugin or avatar icons.

### Generated avatars, beyond the list

- **GitHub identicons:** "generated using a hash of the user's ID", "a simple 5×5 'pixel' sprite", with "hash-determined color values", for "anyone without a Gravatar".
- **boring-avatars** (MIT, the library OpenBot uses): SVG avatars "from any username and color palette", in 6 variants.
  - Its hash is `hash = ((hash<<5)-hash)+character` (`src/lib/utilities.ts`).
  - A color is `colors[(number) % range]`: the same shape of pick this plan makes.
- **DiceBear:** "The `seed` option is the key to generating deterministic avatars." Its minimalist styles include Shapes, Identicon, and Initials, under CC0. Each style has a license of its own.
- **Jdenticon** (MIT): turns a value into an SVG or PNG identicon. Its pages didn't say how it hashes or builds the shape.

### Icons in stores and directories

- **Raycast** requires "a 512x512px icon in `png` format" that looks good "in both light and dark themes": "Extensions that use the default Raycast icon will be rejected."
- **VS Code:** "The icon provided in `package.json` may not be an SVG", because "Due to security concerns, `vsce` will not publish extensions that contain user-provided SVG images."
- **MCP** (spec 2025-11-25) lets servers send `icons`. Clients must:
  - accept only HTTPS or `data:` URIs
  - "Fetch icons without credentials"
  - "Verify that icon URIs are from the same origin as the server"
  - take care with SVG, whose payload "MAY contain executable content"
  - The registry's `server.json` changelog lists no `icons` field. I couldn't read its schema itself.
- **Smithery:** a server without an icon shows two letters, such as "CO" for Context7.
- **No icons at all:** skills.sh's rows, Pi's gallery, and Obsidian's plugin cards.

### Color

- **OKLCH** (Björn Ottosson's Oklab, in polar form, which CSS Color 4 adopted) is made so that equal lightness looks equally light across hues. Two icons at the same L and C look equally bright and equally soft, whatever their hue. HSL doesn't do that: its yellow at 50% lightness is far brighter than its blue. This is from the spec and Ottosson's write-up, not re-read today.
- **Not every OKLCH color fits sRGB.** A strong chroma at some hues falls outside it, so the generator lowers chroma until the color fits, keeping lightness and hue.
- **Yellows and greens** at the lightness that suits blues and reds read as olive. The mockup showed it, and the generator lifts their lightness a little.

## 2. Key takeaways

1. **Draw it, don't fetch it.** A remote icon tells its host who looked, MCP needs a list of precautions for one, and VS Code refuses authors' SVGs. An icon fxbot draws from a string costs no request, and runs nothing of the plugin's.
2. **Key it on what the source vouches for.** GitHub keys identicons on the user's id, and OpenBot on the bot's id, not its name. For a plugin, the creator its source verifies is a GitHub repository's owner, or a registry's namespace. With its name, that's the owner's "name+creator", and both stay put while fxbot runs.
3. **The generator is the contract.** OpenBot: "The order is part of the contract". Here every number in the generator is: a changed constant changes every plugin's icon. So the generator is its own file, frozen once it ships, and the checks pin the expected values for fxbot's plugins.
4. **Continuous values, not lists.** Identicons and boring-avatars pick from a few colors and shapes, so look-alikes are common. Bloom draws a hue from the whole wheel, a second hue beside it, and a shape from five continuous numbers. Two plugins can come out close, but never the same in practice, and the name always sits beside the icon.
5. **Calm by construction.** Fixed OKLCH lightness and chroma make every icon equally bright and equally soft, with its own tones for light and for dark. The two hues are 26° to 64° apart on the wheel, so they never clash.
6. **Stay in fxbot's family, but don't look like a bot.** A soft, rounded shape matches the bots' look. A tile, a gradient, and no eyes keep it a plugin.
7. **A letter doesn't tell fxbot's own apart.** The computer and chat rooms are both **C**.
8. **The SDK gives each plugin its key, and the page draws it.** The key needs what only the server knows: a package's repository, a registry's namespace, and fxbot's list for a checkout's folders. The drawing is a pure function in `@fxbot/sdk/client`, so a list of 20 cards carries 20 short strings, not 20 drawings.

## 3. Implementation

### The look: Bloom

- **The tile:** a rounded square (`rx` 24 of 100), filled with a gradient between two very light tones of the plugin's two hues, at an angle the key picks. In dark mode, two dark tones.
- **The shape:** a circle bent by two waves in its radius, `1 + a1·cos(lobes·t + p1) + a2·cos(harmonic·t + p2)`. With 3 to 7 lobes, it comes out as anything from a rounded triangle to a seven-petal flower. It's drawn through 48 points as one smooth closed curve, scaled so its widest point is 33 from the middle, and filled with a gradient between the two hues at full tone, at right angles to the tile's.
- **The colors:** OKLCH, at fixed lightness and chroma for each of the four tones and each theme, lowered in chroma to fit sRGB, with yellows and greens lifted. The second hue is the first plus or minus 26° to 64°.
- **Sizes:** 16 px in a Settings tab, 20 px in the sidebar, 32 px on a row, 36 px on a card and a dialog's head, and 40 to 56 px on the site.
- **`aria-hidden`:** the name is always beside it, as with `Blob`.

### The key

`<creator>/<name>`, lowercased and trimmed by the generator:

| Kind | Creator | Name | Example |
| --- | --- | --- | --- |
| A package from GitHub | the repository's owner | `plugin.json`'s `name` | `iammrduncan/computer` |
| A package from `FXBOT_PLUGIN_DIRS` | the owner of fxbot's list entry with the same name, so a checkout's plugins look as released; else `local` | `plugin.json`'s `name` | `iammrduncan/computer`, `local/my-plugin` |
| An MCP server from a registry | the namespace, before the `/` | the rest | `org.alphaxiv/alphaxiv` |
| An MCP server added by address | its host | the server's name | `mcp.linear.app/linear` |
| A skill | the repository's owner | the skill's id | `humanlayer/show-me` |

A plugin that moves to another owner gets another icon: it has another creator.

### The generator

`packages/sdk/src/plugin-icon.ts`, new, exported from `@fxbot/sdk/client`. It has no imports, so the site's copy, `packages/website/src/plugin-icon.ts`, is the same file, byte for byte. This is its whole text. The mockup the owner picked from ran the same values in the same order.

```ts
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
```

What it gives fxbot's plugins, run with Node 22 on 2026-11-04. The seed is `iconSeed(key)` in hex, the shape's two colors are `light[2]` and `light[3]`, and the turn is `turn`:

| Plugin | Key | Seed | Shape's first color | Shape's second color | Turn |
| --- | --- | --- | --- | --- | --- |
| computer | `iammrduncan/computer` | `dafef5de` | `#eb728a` | `#fdb569` | 43.5 |
| chat-rooms | `iammrduncan/chat-rooms` | `7c69afc4` | `#e59126` | `#ffa098` | 158.3 |
| alphaXiv | `org.alphaxiv/alphaxiv` | `34be0fa8` | `#00ace7` | `#99bfff` | 292.2 |
| Keiro | `cloud.keirolabs/keiro` | `3d17b543` | `#b584e8` | `#96bfff` | 270 |
| show-me | `humanlayer/show-me` | `5273940a` | `#aeb935` | `#7dd696` | 138.4 |
| frontend-design | `anthropics/frontend-design` | `17926b8e` | `#b8b82f` | `#ffad70` | 353.3 |
| grilling | `mattpocock/grilling` | `3a60c303` | `#8e91f9` | `#dea4f3` | 152.4 |
| fresh | `iammrduncan/fresh` | `4ab055a9` | `#00b2c6` | `#81c5ff` | 281.5 |
| dreams | `iammrduncan/dreams` | `130d4adf` | `#d678c4` | `#c6aeff` | 108 |
| chat-rooms-computer | `iammrduncan/chat-rooms-computer` | `66182be2` | `#ccb426` | `#a1d885` | 249.8 |

The keys are trimmed and lowercased first, so `IAMMRDUNCAN/Computer ` draws the computer's icon.

### The SDK

- **`client.ts`:** `export { iconSeed, pluginIcon, type PluginIcon, type Tones } from "./plugin-icon.ts";`
- **`types.ts`:** `iconKey: string` on `PluginCommon` (so on every `Plugin`), and on `McpCard`, `SkillCard`, `PackageCard`, `PackagePreview`, and `PluginPage`, with one comment: "Who made it and its name, `creator/name`, which a page draws with `pluginIcon`."
- **`registry.ts`:**
  - `cardOf()`: `entry.server.name`, the namespace and the rest.
  - `skillCard()`: `${e.source.split("/")[0]}/${e.skillId}`.
  - `searchPackages()`: `${e.repo.split("/")[0]}/${e.name}`.
  - New, beside `ourPackage`: `listedOwner(name)`, the owner of fxbot's list entry with that name, or `undefined`.
- **`mcp.ts` `view()`:** the registry entry's name when it came from a registry, else `${new URL(url).hostname}/${record.name}`.
- **`skills.ts` `view()`:** from `source.skill`, `owner/repo/skillId`: its first part and its last.
- **`plugins.ts`:**
  - `createPlugins` takes `listedOwner: (name: string) => string | undefined`, as `createSkills` takes `fromOf`.
  - `creatorOf(record)`: `"repo" in record.source ? record.source.repo.split("/")[0] : (listedOwner(record.name) ?? "local")`.
  - ``iconKey: `${creatorOf(record)}/${record.name}` `` in `view()` and in `pages()`, and the preview's from its repository's owner and `plugin.json`'s `name`.
- **`index.ts`:** passes `listedOwner: registry.listedOwner` to `createPlugins`.

### The app

- **`packages/ui/src/plugin-icon.tsx`**, new:
  ```tsx
  import { useId, useMemo, type CSSProperties } from "react";
  import { pluginIcon } from "@fxbot/sdk/client";

  // A plugin's icon, drawn from its key. Its four colors come for both themes, as variables, and index.css picks.
  export function PluginIcon({ iconKey, size = 36 }: { iconKey: string; size?: number }) {
    const id = useId().replace(/\W/g, "");
    const { path, turn, light, dark } = useMemo(() => pluginIcon(iconKey), [iconKey]);
    const colors = Object.fromEntries([...light.map((c, i) => [`--l${i}`, c]), ...dark.map((c, i) => [`--d${i}`, c])]) as CSSProperties;
    const stop = (offset: number, i: number) => <stop offset={offset} style={{ stopColor: `var(--c${i})` }} />;
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="plugin-icon shrink-0" style={colors}>
        <defs>
          <linearGradient id={`${id}t`} gradientTransform={`rotate(${turn} .5 .5)`}>{stop(0, 0)}{stop(1, 1)}</linearGradient>
          <linearGradient id={`${id}s`} gradientTransform={`rotate(${(turn + 90) % 360} .5 .5)`}>{stop(0, 2)}{stop(1, 3)}</linearGradient>
        </defs>
        <rect width="100" height="100" rx="24" fill={`url(#${id}t)`} />
        <path d={path} fill={`url(#${id}s)`} />
      </svg>
    );
  }
  ```
  Each icon gets ids of its own, since a gradient that another SVG on the page defines doesn't draw once that SVG is hidden.
- **`packages/ui/src/index.css`:**
  ```css
  /* A plugin's icon: its light colors, or its dark ones (plugin-icon.tsx). */
  .plugin-icon { --c0: var(--l0); --c1: var(--l1); --c2: var(--l2); --c3: var(--l3); }
  @media (prefers-color-scheme: dark) {
    .plugin-icon { --c0: var(--d0); --c1: var(--d1); --c2: var(--d2); --c3: var(--d3); }
  }
  ```
- **Where `Initial` was,** `<PluginIcon iconKey={…} />`, and `Initial` is deleted:
  - `mcp-add.tsx`: a server's card, and the entry dialog's head, from `card.iconKey`.
  - `skills.tsx`: a skill's card, and the skill dialog's head, from `card.iconKey`.
  - `packages.tsx`: the plugin dialog's head, from `page?.iconKey ?? target.iconKey`. `PluginTarget` gains `iconKey?: string`, which a pick passes from its card. A repository typed under **From GitHub** shows none until its page loads.
  - `plugins-page.tsx`: the picks' `Card` type gains `iconKey`, from each list's card.
- **Installed rows** (`plugins-page.tsx`): `<PluginIcon iconKey={addon.iconKey} size={32} />` before the name.
- **The sidebar's footer:**
  - `plugins.tsx` keeps each page entry's `iconKey` on `Loaded`, and `usePluginNav()` returns it.
  - `app.tsx` draws `<PluginIcon iconKey={…} size={20} />` where it drew the letter. A plugin with two buttons and no icons shows its icon on both, and the tooltips say which.
- **Settings:** when [settings tabs](settings-tabs.md) is built, each plugin's tab draws its icon at 16 px from `usePlugins()`. Whichever phase lands second wires it.

### The site

- **`packages/website/src/plugin-icon.ts`:** the copy.
- **`packages/website/src/components/PluginIcon.astro`:** the same SVG as the app's, drawn at build time, with its ids from the seed and a counter. Its CSS picks the colors by Starlight's theme, `:root[data-theme="dark"] .plugin-icon`, since the site has a theme switch of its own. Nothing on the site draws it until [the directory](plugin-directory.md).

### Not in this phase

- An icon a plugin ships itself. The owner asked for generated ones.
- Fetching a registry's or a server's icon.
- Icons for the MCP servers in a package's settings, or for tools in a reply.
- `PluginIcon` in `@fxbot/app`'s `ui`, until a plugin needs it.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/plugin-icon.ts` | New: the generator, as above | 90 |
| `packages/sdk/src/client.ts`, `types.ts` | The export; `iconKey` on plugins, cards, previews, and pages | 8 |
| `packages/sdk/src/registry.ts`, `mcp.ts`, `skills.ts` | `iconKey` on each card and view; `listedOwner` | 10 |
| `packages/sdk/src/plugins.ts`, `index.ts` | `listedOwner`, `creatorOf`, and `iconKey` on views, pages, and previews | 7 |
| `packages/ui/src/plugin-icon.tsx`, `index.css` | `PluginIcon`, and its theme's colors | 30 |
| `packages/ui/src/mcp-add.tsx`, `skills.tsx`, `packages.tsx`, `plugins-page.tsx` | `Initial` out, `PluginIcon` in, and on rows | 6 more, 6 fewer |
| `packages/ui/src/plugins.tsx`, `app.tsx` | The nav's fallback | 4 |
| `packages/website/src/plugin-icon.ts`, `components/PluginIcon.astro` | The copy, and the site's drawing | 90 copied, 25 new |
| Docs and changelog | Plugin API, the SDK's `plugins.list()`, Add a plugin, and a changelog line | 8 |

Size: about 190 lines, plus the site's 90-line copy. The page gains about 1.5 KB of script, under 1 KB gzipped, and no request. Each icon is computed once per key and render, in well under a millisecond. Each list the server sends gains one short string per plugin.

## 4. Checklist

The bound: about 190 lines, plus the site's copy, as above. Past 250, stop and say why. What's out of scope is under [Not in this phase](#not-in-this-phase). Checks run against a disposable Postgres, `FXBOT_DATA`, and `FXBOT_PORT`, as [AGENTS.md](../../AGENTS.md#checks) says, never the owner's running dev server.

**M1. The look**
- [x] A mockup page outside the repository drew three generated styles (Bloom, Aura, and Facet) on fxbot's list, the three 0.5.0 plugins, look-alike keys, and 48 example keys, at 16 to 96 px, light and dark.
- [x] The owner picked Bloom, on 2026-11-04.

**M2. The SDK**
- [ ] `packages/sdk/src/plugin-icon.ts` is the generator above, character for character.
- [ ] `node --input-type=module -e 'import { pluginIcon, iconSeed } from "./packages/sdk/src/plugin-icon.ts"; for (const k of ["iammrduncan/computer", "IAMMRDUNCAN/Computer "]) console.log(iconSeed(k).toString(16), pluginIcon(k).light.slice(2), pluginIcon(k).turn)'` prints `dafef5de [ '#eb728a', '#fdb569' ] 43.5` twice, and the other nine keys give the table's values.
- [ ] On a disposable server, every item of `GET /api/plugins`, and every card of `GET /api/plugins/search?q=&kind=package`, `kind=skill`, and the servers' search, has `iconKey`, with the table's keys for fxbot's lists.
- [ ] `GET /api/plugins/pages` has each running package's `iconKey`.
- [ ] With `FXBOT_PLUGIN_DIRS` set to `plugins/computer`, the computer's `iconKey` is `iammrduncan/computer`, as from GitHub. A copy of a plugin folder renamed `zz-test` is `local/zz-test`.

**M3. The app**
- [ ] Browse's 7 picks each show their icon. The first stop of each shape's gradient, read from the page in light mode, is the table's first color.
- [ ] Each add dialog's head shows the icon of the card that opened it. **From GitHub** shows the icon once the page loads.
- [ ] With unvetted plugins on, MCP results and skills.sh results show icons.
- [ ] Installed rows show icons at 32 px, and a row's text still truncates on a phone (375 px).
- [ ] A test plugin that calls `app.nav({ label: "Hello", path: "/count" })` with no `icon` shows its icon in the sidebar's footer at 20 px, with the tooltip "Hello".
- [ ] Two of the same icon on one screen, one of them in a closed dialog, both draw their gradients.
- [ ] `grep -rn "Initial" packages/ui/src` finds nothing.
- [ ] With the system set to dark, every icon uses its dark tones, with no reload.

**M4. The site's copy**
- [ ] `cmp packages/sdk/src/plugin-icon.ts packages/website/src/plugin-icon.ts` says nothing.
- [ ] `PluginIcon.astro` draws the same SVG as the app's for the same key, and follows the site's theme switch.

**M5. Docs and checks**
- [ ] The Plugin API page (`packages/website/src/content/docs/sdk/reference/plugin-api.md`):
  - the `app.nav` row says that without an `icon`, the button shows the plugin's icon
  - the `name` row says that it and the repository's owner make the plugin's icon
- [ ] The SDK's `plugins.list()` row (`sdk/reference/server-api.md`) says each plugin and card has `iconKey`, and the client reference names `pluginIcon(key)`.
- [ ] Add a plugin (`docs/how-to/add-a-plugin.md`) says each plugin's icon is drawn from who made it and its name, so it looks the same wherever it shows.
- [ ] `CHANGELOG.md` has a `## Unreleased` section above 0.4.1, with a line for plugin icons that names the SDK's new `iconKey` and `pluginIcon`.
- [ ] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [ ] `git diff --check` passes, and the new files have no trailing whitespace.
- [ ] One commit on `release/0.5.0`, not pushed.

**The human checks:**
- The icons in a real browser, light and dark, on a phone and a desktop: calm beside the bots, and fxbot's plugins look apart.
- A plugin's icon in the sidebar's footer, beside the Library and Plugins buttons.

## 5. Open questions

1. **A checkout's plugins.** *Default:* a folder whose name is on fxbot's list takes that entry's creator, so the owner's dev install shows the computer as released. It costs about 6 lines of SDK plumbing. *The other way:* every folder is `local`, with no plumbing, and the dev install's computer has another icon than fxbot.sh's.
