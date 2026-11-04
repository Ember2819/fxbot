# Plugin icons

Every plugin gets an icon, made from its name and its creator, so that the same plugin always shows the same icon, in the app and on [fxbot.sh's directory](plugin-directory.md). Nobody draws one: it's generated, in the style of the bots' own looks.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word. The look itself needs the owner's pick from a few mockups before it's built.

## Core or plugin

**Core.** Finding and adding plugins is core, and the icon is how a plugin shows there. The icon is a pure function of a key, with no request, no stored image, and no code a plugin runs.

## The key

`<creator>/<name>`, from what fxbot already knows about each kind:

| Kind | Creator | Name | Example key |
| --- | --- | --- | --- |
| A package from GitHub | the repository's owner | `plugin.json`'s `name` | `iammrduncan/computer` |
| A package from `FXBOT_PLUGIN_DIRS` | the creator of the entry on fxbot's list with the same name, so a checkout's own plugins look as released; otherwise `local` | `plugin.json`'s `name` | `iammrduncan/computer`, `local/my-plugin` |
| An MCP server from a registry | the namespace, before `/` | the rest | `org.alphaxiv/alphaxiv` |
| An MCP server added by address | the host | the server's name | `mcp.linear.app/linear` |
| A skill | the repository's owner | the skill's id | `humanlayer/show-me` |

Lowercased, so `Foo/Bar` and `foo/bar` match. A plugin that moves to another repository owner gets a new icon. That's honest: it's a different creator.

## The look

The app's bots are soft shapes in a palette of colors, with eyes (`packages/ui/src/blob.tsx`). A plugin's icon should sit beside them without looking like a bot:
- a rounded square tile, tinted with one palette color at low strength
- on it, one of the bots' 14 shapes, flat, with no eyes, in a second palette color, turned by one of 8 angles
- 32-bit FNV-1a of the key picks the tile's color, the shape, its color (never the tile's), and the angle: over 10,000 looks

It's drawn as an inline SVG at any size, from 16 px in a tab to 96 px on a plugin's page, and in dark mode the tile's tint is darker.

Before it's built, a mockup page shows three candidate styles on the real list's plugins, light and dark, for the owner to pick. The other two candidates are a tile with two overlapping shapes, and a tile with the name's first letter on a shape.

## Where it shows

- The Plugins page: each row of what's added, each card in Browse, and the head of a plugin's page.
- [Settings](settings-tabs.md): each plugin's tab.
- The sidebar's footer: an `app.nav` button without an `icon` shows the plugin's icon instead of its label's first letter.
- [fxbot.sh's directory](plugin-directory.md): each card and page.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/plugin-icon.ts`, exported from `@fxbot/sdk/client` | `iconKey(plugin)` and `iconFor(key)`: the hash and the picks | about 40 |
| `packages/ui/src/blob.tsx` | The shapes' paths, exported for a flat draw with no eyes | about 5 |
| `packages/ui/src/plugin-icon.tsx` | `PluginIcon`, the SVG | about 30 |
| `packages/ui/src` | The icon in the places above | about 20 |
| `packages/website` | The same picks and drawing, copied: the site imports none of the other packages, as its `blob.tsx` already shows | about 60 |

Size: about 155 lines, of which about 60 are the site's copy. No request, no storage, and about 1 KB of page weight.

## Checks

- Each plugin on fxbot's lists shows the same icon in the app and on the site.
- The same key gives the same icon after a reload, on another device, and in another release.
- Light and dark, at 16, 24, 40, and 96 px: the shape reads, and no two of fxbot's own plugins look alike.

## Questions

1. Which of the mockups' styles. Asked when the mockups are ready.
2. Should a plugin be able to ship its own icon in `plugin.json` later? Not in this phase: the owner asked for generated ones.
