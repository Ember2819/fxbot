# Settings in tabs

Settings becomes a screen of tabs: **General**, **Providers**, **Memory**, **Plugins**, and **About**, plus a tab for each plugin that has settings of its own. About gathers what is now the version row at the bottom: the version, updates and their notes, and links.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word.

## Core or plugin

**Core.** Settings is the app's own screen, and its tabs are where plugins plug in. The plugin API changes by one place: what a plugin's `app.settings(Component)` adds becomes a tab of its own, named for the plugin, instead of a section in one long page. No plugin has to change.

## Today

`SettingsForm` (`packages/ui/src/app.tsx`) is one column: the install prompt, providers and the default provider, memory search, the unvetted switch, each plugin's `app.settings` section, then `Version` (`packages/ui/src/release.tsx`). The computer plugin is the only one with a section.

## How it works

- **Tabs, in the address.** `/settings` opens General. Each tab is `/settings/<tab>`, so a link, a plugin, or the computer's setup notice can open one, and Back works. A plugin's tab is `/settings/<plugin>`.
- **The tabs:**
  - **General:** install the app, the default bot ([default bot](default-bot.md)), and New bots start on the default provider.
  - **Providers:** the providers list and the default provider, as today.
  - **Memory:** memory search, as today.
  - **Plugins:** **Show unvetted plugins**, and a link to the Plugins page.
  - **About:** fxbot's version, and the update when one is out: the Version row as it is, moved. Below it, links to fxbot.sh, the docs, the changelog for this version, and the repository, and the license (Apache 2.0).
  - **One per plugin** with an `app.settings` part, between Plugins and About, in the order the plugins were added. About stays last. The tab's label is the plugin's name, and its icon the plugin's ([plugin icons](plugin-icons.md)).
- **Layout.** On a wide screen, the tabs are a column on the left and the tab's content on the right. On a phone, they're a row at the top that scrolls sideways. This uses the shadcn `tabs` component the UI already has, which the Plugins page uses too.
- **The New version badge** in the sidebar opens `/settings/about`.
- **A plugin's label.** `app.settings(Component, { label })` may name its tab. Without one, it's the plugin's name, capitalized.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/ui/src/settings.tsx` | `SettingsForm` moves out of `app.tsx`, as tabs | about 120, of which about 60 move |
| `packages/ui/src/release.tsx` | About's links beside `Version` | about 25 |
| `packages/ui/src/plugins.tsx` | `settings` keeps each plugin's label; `usePluginSettings()` lists the tabs | about 15 |
| `packages/ui/src/app.tsx` | `/settings/*` routes to the tabs; the badge's link | about 5 |
| Website | Plugin API: `app.settings` makes a tab, and takes `{ label }`; screenshots of Settings in the docs, if any, say the new place | about 10 |

Size: about 120 new lines. Nothing changes in the SDK or the server. Page weight stays the same: the screen was already in the bundle.

## Checks

- `/settings` opens General; each tab's address opens it; Back goes to the tab before.
- The computer plugin's section shows as a **Computer** tab, and keeps working: setup status, **Try again**.
- With no plugins, there are five tabs. Turning a plugin with a settings part off removes its tab on the next read of the list.
- About shows the version, and in a release install with an update out, **Update** works as it did.
- Phone width (375 px): the tab row scrolls, nothing overflows the page.

## Questions

None open.
