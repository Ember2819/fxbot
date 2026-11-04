# A default bot

The owner picks one bot as the default. Launching the app opens straight to that bot's chat, instead of "Pick a bot".

Status: planned on 2026-11-04, for 0.5.0, at the owner's word. The owner chose that the default bot's chat carries on as it is: launching doesn't start a new session.

## Core or plugin

**Core.** It is how the app opens. A plugin would need a new hook into the app's first screen, larger than the feature itself.

## How it works

- **One default at most.** A bot's menu in the sidebar, beside **Pin**, gets **Make default**, and the default's menu **Remove as default**. General in [Settings](settings-tabs.md) has the same choice as a list of bots, with **None**.
- **Stored with the bot,** as `pinned` is: a column `is_default` on `profiles`, with a unique index over the rows where it's true, so there's never a second one. Making a bot the default clears the old one in the same statement. Deleting the bot clears it.
- **Launch.** The bots list the app already reads at launch carries `isDefault` on each bot. When the app starts at `/` and a bot is the default, it replaces the address with that bot's chat before it paints, so Back doesn't return to "Pick a bot". This adds no request and no wait to loading the page.
- **Only a launch.** A link that opens another screen, such as a notification's or `/settings`, opens that screen. Going to `/` later in the same visit, from the sidebar, shows Home as today.
- **The sidebar** marks the default bot with a small dot or star on its row, so it's clear which one the app opens to.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/migrations/0008_default_bot.sql` | `is_default` on `profiles`, and its unique partial index | about 5 |
| `packages/sdk` | `Profile.isDefault`; `profiles.update(id, { isDefault })` sets or clears it in one statement | about 15 |
| `packages/server` | Nothing: `PATCH /api/profiles/:id` already passes fields to the SDK | 0 |
| `packages/ui/src/app.tsx` | The launch redirect, the menu entries, the mark | about 25 |
| `packages/ui/src/settings.tsx` | General's choice | about 15 |
| `CHANGELOG.md` | Migration `0008_default_bot` under Before upgrading | about 2 |
| Website | Server API: `isDefault`; HTTP API's profile fields | about 5 |

Size: about 60 lines and one migration.

## Checks

- Make a bot the default; close and open the installed app; it opens on that bot's chat, at its end. Back leaves the app rather than showing Home.
- Make another bot the default; the first loses its mark. Two requests at once leave one default.
- Delete the default bot; the app opens on Home.
- With no default, the app opens on Home as today.
- Open `/settings` directly: Settings shows, not the bot.
- The migration runs on a copy of a 0.4.1 database, with its backup first.

## Questions

None open.
