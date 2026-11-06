# permissions

A plugin for [fxbot](https://fxbot.sh): decide what each bot does on its own, and what it asks you about first. Each bot has a mode, a call that needs you shows a card above its message box, and the rules you save make it ask less.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. It needs fxbot 0.6.0 or newer. See [Choose what a bot can do alone](https://fxbot.sh/docs/how-to/choose-what-a-bot-can-do-alone/).

This is a seatbelt, not a wall. A reviewer misses things, and a page can be written to fool one.

## A call

Every tool call passes through `tool.before`, in this order:

| What it finds | What happens |
| --- | --- |
| The bot is on `yolo` | It runs |
| The owner said no to this call in this turn | Blocked |
| 3 no's this turn | Blocked, and the bot is told to stop and say what it wanted |
| A rule allows it | It runs |
| The tool is safe | It runs |
| `ask` | It waits for the card |
| `auto` | It waits for the reviewer, then runs, or waits for the card |

The call waits in place, through `tool.before`'s `wait`, so what the owner approves is exactly what runs. A waiting call holds its turn, so a message from the owner closes the card first.

## The reviewer

One tool-free request, on the bot's own model, or the provider and model picked in **Settings** › **Permissions**. It gets the owner's last 10 messages, the bot's name, the action as JSON, and for a turn from a plugin in `trusted`, that turn's text. It gets no tool results, no other bot's words, and no chat, so what attacked the bot can't reach it, except through the action itself.

Only a clean `allow` runs a call. A flag, an error, a timeout, an answer that isn't JSON, or an action over 16 KiB shows a card. An identical call in a turn pays once.

## Who's there

A turn with no `from` on `turn.start` is the owner's, and its card waits. Any other is background, and its card expires after `expires` minutes: the call fails, and the model hears that this isn't a no. A turn the plugin doesn't know, after a restart, is background.

A card closes when the owner writes in that chat, when the turn ends, or when the bot's mode changes. After a restart, a call marked `idempotent` runs again and finds its card. Any other gets libfx's failed result, and `turn.end` closes its card.

## Rules

**Always allow** saves one for that bot. A tool in `exact` gets a rule for that exact input, and any other gets a rule for the whole tool. A rule can't be written by hand, and a bot can't write one: the plugin gives bots no tools.

## Settings

| Setting | What it is | Default |
| --- | --- | --- |
| `mode` | A bot's mode until you set one: ask, auto, or yolo | `auto` |
| `seconds` | The most seconds a review takes, 5 to 300 | `60` |
| `expires` | The minutes a background card waits, 1 to 1,440 | `30` |
| `trusted` | Plugins whose turn text counts as the owner's words | `routines` |
| `exact` | Tools whose rules are the exact action | `computer_shell, computer_terminal, computer_desktop` |

A value outside its range means its default, with a line in the plugin's log.

## Tables

In the plugin's own schema, `plugin_permissions`, from `fxbot/migrations/0001_permissions.sql`:
- `modes`: each bot's mode, when it has its own
- `rules`: what **Always allow** saved
- `reviewer`: the provider and model that review, when one is picked
- `asks`: each card, kept 30 days

Removing the plugin drops the schema.

## Cost

- **A tool call:** a read of a map. On `yolo`, a safe tool, or a rule, that's all.
- **A risky call in `auto`:** one model request of about 500 tokens in and 50 out, on each new call, and the seconds it takes.
- **Each bot's requests:** nothing: the plugin adds no tools and no instructions.
- **A card that's open:** a held turn, so one of **Turns at once**, about 5 database commits a second, and about 0.1% of a core, for as long as it waits.
- **Idle:** the page reads `/asks` every 15 seconds, and every 3 while a bot works or a card is open. The server reads the table only while a call waits.
- **Storage:** 30 days of cards.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, its parts, and its settings |
| `fxbot/server.ts` | The decision, cards, the reviewer, rules, and the routes |
| `fxbot/migrations/0001_permissions.sql` | Its four tables |
| `fxbot/page.jsx` | The card, the mode, the sidebar group, a bot's section, and the reviewer |
| `fxbot/page.js` | `page.jsx`, built |
| `package.json` | `"type": "module"`, for the server code |

Build `page.js` from this folder with:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
