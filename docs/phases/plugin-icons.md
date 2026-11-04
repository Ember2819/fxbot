# Plugin icons

Every plugin gets an icon, drawn from who made it and its name, so the same plugin looks the same everywhere: in **Plugins**, in the sidebar, in Settings, and on [fxbot.sh's directory](plugin-directory.md). Nobody draws one, and nothing is fetched. The recommended look is one of the bots' shapes, flat and without eyes, on a rounded tile of its color.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word; researched against the research directive's references. The owner's decisions:
- "Plugins need icons, auto generated, in the clean style we are keeping, keyed off their name+creator or something."
- The look isn't picked yet. A mockup page of candidates comes first ([M1](#4-checklist)), and the owner picks one before anything is built. This plan recommends one.
- It's built before [the plugin directory](plugin-directory.md), which draws the same icons.

## 0. Core or plugin

**Core.** [Conventions](../../CONVENTIONS.md#core-or-plugin) put finding, vetting, and adding plugins in the core, and an icon is how a plugin shows where it's found and added.
- The icon is a function of two strings. It needs no request, no stored image, no table, and no code from the plugin.
- The core names no plugin. The SDK gives every plugin its look by one rule.
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

## 2. Key takeaways

1. **Draw it, don't fetch it.** A remote icon tells its host who looked, MCP needs a list of precautions for one, and VS Code refuses authors' SVGs. An icon fxbot draws from a string costs no request, and runs nothing of the plugin's.
2. **Key it on what the source vouches for.** GitHub keys identicons on the user's id, and OpenBot on the bot's id, not its name. For a plugin, the creator its source verifies is a GitHub repository's owner, or a registry's namespace. With its name, that's the owner's "name+creator", and both stay put while fxbot runs.
3. **The list's order is the contract** (OpenBot). Icons pick from lists of their own, frozen, so a shape added for bots changes no plugin's icon.
4. **A letter doesn't tell fxbot's own apart.** The computer and chat rooms are both **C**. A shape and a color need no letter, as in identicons, boring-avatars, and DiceBear's Shapes.
5. **Stay in fxbot's look.** The bots' shapes, drawn flat, keep the family. A tile and no eyes keep a plugin from looking like a bot.
6. **One color per icon is the cleanest.** That gives 126 looks: 9 colors by 14 shapes.
   - On an install with 10 plugins, there's about a 1 in 3 chance that two share a look. The name beside each tells them apart.
   - Two colors give 1,008 looks, about a 1 in 25 chance, at the cost of a busier icon.
   - A turn adds little: a circle turned looks the same, and an upside-down heart looks like a mistake.
7. **FNV-1a, 32 bits,** as OpenBot: four lines, the same in the SDK and on the site.
8. **The SDK gives each plugin its look,** as it names the bots' shapes and colors. Each plugin, card, and page carries `icon: { shape, color }`, and a UI only draws it.

## 3. Implementation

### The look (recommended)

- **The tile:** a rounded square, in the plugin's color at 16% opacity. It's lighter on a light page and darker on a dark one, with no theme code.
- **The shape:** one of the bots' 14, flat, in the full color, at 64% of the tile and centered. No eyes, no pumpkin stem, and no turn.
- **The colors:** 9, the bots' palette without black, which vanishes on a dark page, and gray, which reads as off.
- **Sizes:** 20 px in the sidebar, 32 px on a row, 36 px on a card, and 40 to 56 px on the site.
- **`aria-hidden`:** the name is always beside it, as with `Initial` and `Blob`.

The mockup's two other candidates:
- **Two colors:** the tile in one color and the shape in another, as the first draft had it: 1,008 looks.
- **A letter on a shape:** the name's first letter, in white, on a shape of its color. The computer and chat rooms come out as two C's.

### The key

`<creator>/<name>`, lowercased:

| Kind | Creator | Name | Example |
| --- | --- | --- | --- |
| A package from GitHub | the repository's owner | `plugin.json`'s `name` | `iammrduncan/computer` |
| A package from `FXBOT_PLUGIN_DIRS` | the owner of fxbot's list entry with the same name, so a checkout's plugins look as released; else `local` | `plugin.json`'s `name` | `iammrduncan/computer`, `local/my-plugin` |
| An MCP server from a registry | the namespace, before the `/` | the rest | `org.alphaxiv/alphaxiv` |
| An MCP server added by address | its host | the server's name | `mcp.linear.app/linear` |
| A skill | the repository's owner | the skill's id | `humanlayer/show-me` |

A plugin that moves to another owner gets another icon: it has another creator.

### The hash and the picks

`packages/sdk/src/plugin-icon.ts`, new. It has no imports, so the site's copy, `packages/website/src/plugin-icon.ts`, is the same file, byte for byte:

```ts
// A plugin's icon: one of these shapes in one of these colors, picked by a hash of who made it and its name. The lists
// are frozen: a shape or color added for bots changes no plugin's icon, and reordering them changes every one.
// packages/website/src/plugin-icon.ts is a copy of this file, byte for byte.
export const iconShapes = ["circle", "cloud", "squircle", "star", "clover", "heart", "flower", "egg", "bean", "triangle", "diamond", "sparkle", "hexagon", "pumpkin"] as const;
export const iconColors = ["brown", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"] as const;

// 32-bit FNV-1a over the key's UTF-16 code units, as OpenBot's orbs: the color from the remainder by 9, the shape from
// what's left.
export function pluginIcon(creator: string, name: string) {
  const key = `${creator}/${name}`.toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  hash >>>= 0;
  return { shape: iconShapes[Math.floor(hash / iconColors.length) % iconShapes.length], color: iconColors[hash % iconColors.length] };
}
```

What it gives fxbot's listed plugins, run with Node 22 on 2026-11-04:

| Plugin | Key | Color | Shape |
| --- | --- | --- | --- |
| computer | `iammrduncan/computer` | amber | egg |
| chat-rooms | `iammrduncan/chat-rooms` | brown | flower |
| alphaXiv | `org.alphaxiv/alphaxiv` | pink | clover |
| Keiro | `cloud.keirolabs/keiro` | teal | squircle |
| show-me | `humanlayer/show-me` | green | circle |
| frontend-design | `anthropics/frontend-design` | green | diamond |
| grilling | `mattpocock/grilling` | red | hexagon |

All seven differ. A checkout's computer keyed `local/computer` would be a green clover, which is why a local folder takes its list entry's creator.

If the owner picks another candidate, only the return line changes, and the table is computed again:
- **Two colors:** `tile = hash % 9`, `color = (tile + 1 + Math.floor(hash / 9) % 8) % 9`, and `shape = Math.floor(hash / 72) % 14`, so the shape's color is never the tile's. The return gains `tile`.
- **A letter on a shape:** the picks stay, and the drawing adds the letter.

### The SDK

- **`types.ts`:**
  ```ts
  // A plugin's icon: one of the bots' shapes in one of their colors, from who made it and its name (plugin-icon.ts).
  export type Look = { shape: Shape; color: Color };
  ```
  - `icon: Look` on `PluginCommon` (`types.ts:140`), so on every `Plugin`.
  - `icon: Look` on `McpCard` (`:282`), `SkillCard` (`:288`), `PackageCard` (`:224`), `PackagePreview` (`:201`), and `PluginPage` (`:227`).
- **`registry.ts`:**
  - `cardOf()` (`:59`): `pluginIcon(namespace, rest)`, from `entry.server.name` split at its `/`.
  - `skillCard()` (`:83`): `pluginIcon(e.source.split("/")[0], e.skillId)`.
  - `searchPackages()` (`:386`): `pluginIcon(e.repo.split("/")[0], e.name)`.
  - New, beside `ourPackage`: `listedOwner: (name: string) => ourPlugins.find((e) => e.name === name)?.repo.split("/")[0]`.
- **`mcp.ts` `view()`** (`:348`): from `record.source.registry` when it came from a registry, else `pluginIcon(new URL(url).hostname, record.name)`.
- **`skills.ts` `view()`** (`:89`): from `source.skill`, `owner/repo/skillId`: its first part and its last.
- **`plugins.ts`:**
  - `createPlugins` takes `listedOwner: (name: string) => string | undefined`, as `createSkills` takes `fromOf` (`index.ts:145`).
  - `creatorOf(record)`: `"repo" in record.source ? record.source.repo.split("/")[0] : (listedOwner(record.name) ?? "local")`.
  - `icon: pluginIcon(creatorOf(record), record.name)` in `view()` (`:596`) and in `pages()` (`:659`).
  - The preview (`:305`): `pluginIcon` of its repository's owner and `plugin.json`'s `name`.
- **`index.ts`:** passes `listedOwner: registry.listedOwner` to `createPlugins` (`:153`).

The hash runs on the server, once for each plugin or card a call returns. `@fxbot/sdk/client` gains only the `Look` type.

### The app

- **`packages/ui/src/blob.tsx`** gains the drawing, beside `Blob`, from the same `drawn` paths:
  ```tsx
  // A plugin's icon: one of the bots' shapes, flat and without eyes, on a rounded tile of its color.
  export function PluginIcon({ shape, color, size = 36 }: Look & { size?: number }) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" data-color={color} data-shape={shape} className="shrink-0">
        <rect width="100" height="100" rx="22" fill={colors[color]} fillOpacity="0.16" />
        <path d={drawn[shape].d} fill={colors[color]} transform="translate(18 18) scale(0.64)" />
      </svg>
    );
  }
  ```
  `rx="22"` is `Initial`'s 8 px corner at 36 px.
- **Where `Initial` was,** `<PluginIcon {...x.icon} />`, and `Initial` is deleted:
  - `mcp-add.tsx`: a server's card, and the entry dialog's head, from `card.icon`.
  - `skills.tsx`: a skill's card, and the skill dialog's head, from `card.icon`.
  - `packages.tsx`: the plugin dialog's head, from `page?.icon ?? target.icon`. `PluginTarget` gains `icon?: Look`, which a pick passes from its card. A repository typed under **From GitHub** shows none until its page loads.
  - `plugins-page.tsx`: the picks' `Card` type gains `icon: Look`, from each list's card.
- **Installed rows** (`plugins-page.tsx:171`): `<PluginIcon {...addon.icon} size={32} />` before the name.
- **The sidebar's footer:**
  - `plugins.tsx` keeps each page entry's `icon` on `Loaded`.
  - `usePluginNav()` returns it as `look`, since `icon` is the plugin's own component.
  - `app.tsx:332` draws `<PluginIcon {...look} size={20} />` where it drew the letter. A plugin with two buttons and no icons shows its icon on both, and the tooltips say which.
- **Settings:** when [settings tabs](settings-tabs.md) is built, each plugin's tab draws its icon from `usePlugins()`. Whichever phase lands second wires it.

### The site

- **`packages/website/src/plugin-icon.ts`:** the copy.
- **`packages/website/src/blob.tsx`:** the same `PluginIcon`, from its own `drawn` and `colors`. Nothing on the site draws it until [the directory](plugin-directory.md).

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/plugin-icon.ts` | New: the frozen lists and `pluginIcon` | 15 |
| `packages/sdk/src/types.ts` | `Look`, and `icon` on plugins, cards, previews, and pages | 8 |
| `packages/sdk/src/registry.ts`, `mcp.ts`, `skills.ts` | `icon` on each card and view; `listedOwner` | 8 |
| `packages/sdk/src/plugins.ts`, `index.ts` | `listedOwner`, `creatorOf`, and `icon` on views, pages, and previews | 7 |
| `packages/ui/src/blob.tsx` | `PluginIcon` | 12 |
| `packages/ui/src/mcp-add.tsx`, `skills.tsx`, `packages.tsx`, `plugins-page.tsx` | `Initial` out, `PluginIcon` in, and on rows | 6 more, 6 fewer |
| `packages/ui/src/plugins.tsx`, `app.tsx` | The nav's fallback | 4 |
| `packages/website/src/plugin-icon.ts`, `blob.tsx` | The copy, and `PluginIcon` | 27 |
| Docs and changelog | Plugin API, the SDK's `plugins.list()`, Add a plugin, and a changelog line | 6 |

Size: about 100 lines, 27 of them the site's copy. The page gains about 0.4 KB of script and no request. Each plugin list the server sends gains a few bytes per plugin, and a hash of a short string.

### Not in this phase

- An icon a plugin ships itself. The owner asked for generated ones.
- Fetching a registry's or a server's icon.
- Icons for the MCP servers in a package's settings, or for tools in a reply.
- `PluginIcon` in `@fxbot/app`'s `ui`, until a plugin needs it.

## 4. Checklist

The bound: about 100 lines, as above. Past 150, stop and say why. What's out of scope is under [Not in this phase](#not-in-this-phase). Checks run against a disposable Postgres, `FXBOT_DATA`, and `FXBOT_PORT`, as [AGENTS.md](../../AGENTS.md#checks) says, never the owner's running dev server.

**M1. The look**
- [ ] A mockup page outside the repository draws the three candidates:
  - on fxbot's 7 listed plugins and 13 made-up keys
  - at 16, 20, 36, and 56 px, light and dark
  - beside a few bots' `Blob`s
- [ ] The owner picked one, and this doc's Status line says which. Stop here until the owner has.

**M2. The SDK**
- [ ] `node -e 'import("./packages/sdk/src/plugin-icon.ts").then(({ pluginIcon }) => console.log(pluginIcon("iammrduncan", "computer"), pluginIcon("IAMMRDUNCAN", "Computer")))'` prints amber egg twice, and the other six keys give the table's picks.
- [ ] `iconShapes` and `iconColors` are lists of their own, not `shapes` and `colors` from `types.ts`.
- [ ] On a disposable server, every item of `GET /api/plugins`, and every card of `GET /api/plugins/search?q=&kind=package`, `kind=skill`, and the servers' search, has `icon`, with the table's picks for fxbot's lists.
- [ ] `GET /api/plugins/pages` has each running package's `icon`.
- [ ] With `FXBOT_PLUGIN_DIRS` set to `plugins/computer`, the computer's `icon` is amber egg, as from GitHub. A copy of a plugin folder renamed `zz-test` is `local/zz-test`'s look.

**M3. The app**
- [ ] Browse's 7 picks each show their icon, as in the table: `data-color` and `data-shape` on each `svg`.
- [ ] Each add dialog's head shows the icon of the card that opened it. **From GitHub** shows the icon once the page loads.
- [ ] With unvetted plugins on, MCP results and skills.sh results show icons.
- [ ] Installed rows show icons at 32 px, and a row's text still truncates on a phone (375 px).
- [ ] A test plugin that calls `app.nav({ label: "Hello", path: "/count" })` with no `icon` shows its icon in the sidebar's footer at 20 px, with the tooltip "Hello".
- [ ] `grep -rn "Initial" packages/ui/src` finds nothing.
- [ ] In light and dark, each icon's shape shows on its tile.

**M4. The site's copy**
- [ ] `cmp packages/sdk/src/plugin-icon.ts packages/website/src/plugin-icon.ts` says nothing.
- [ ] `packages/website/src/blob.tsx` exports `PluginIcon`, drawing the same SVG as the app's.

**M5. Docs and checks**
- [ ] The Plugin API page (`packages/website/src/content/docs/sdk/reference/plugin-api.md`):
  - the `app.nav` row says that without an `icon`, the button shows the plugin's icon
  - the `name` row says that it and the repository's owner pick the plugin's icon
- [ ] The SDK's `plugins.list()` row (`sdk/reference/server-api.md:154`) says each plugin and card has `icon`, a shape and a color to draw it with.
- [ ] Add a plugin (`docs/how-to/add-a-plugin.md`) says each plugin's icon is drawn from who made it and its name, so it looks the same wherever it shows.
- [ ] `CHANGELOG.md` has a `## Unreleased` section above 0.4.1, with a line for plugin icons that names the SDK's new `icon` fields.
- [ ] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [ ] `git diff --check` passes, and the new files have no trailing whitespace.
- [ ] One commit on `release/0.5.0`, not pushed.

**The human checks:**
- The icons in a real browser, light and dark, on a phone and a desktop: clean beside the bots, and fxbot's 7 look apart.
- A plugin's icon in the sidebar's footer, beside the Library and Plugins buttons.

## 5. Open questions

1. **The look.** *Recommended:* one color, a tinted tile with a flat shape. It's the cleanest, and it stays in the bots' family. Its cost is 126 looks, so on a busy install two plugins can share one, with their names beside them. *The others:* two colors, with 1,008 looks and a busier icon, or a letter on a shape, which makes fxbot's own two plugins both C. Asked with the mockup, [M1](#4-checklist).
2. **A checkout's plugins.** *Default:* a folder whose name is on fxbot's list takes that entry's creator, so the owner's dev install shows the computer as released. It costs about 6 lines of SDK plumbing. *The other way:* every folder is `local`, with no plumbing, and the dev install's computer is a green clover while fxbot.sh's is an amber egg.
