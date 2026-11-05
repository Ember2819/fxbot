# routines

A plugin for [fxbot](https://fxbot.sh): a bot runs saved tasks on a schedule, such as a morning summary, without anyone opening the chat. Each run has everything the bot has, its computer, MCP servers, skills, memories, and library, and its result reaches the owner in the bot's chat, with the files it saved.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. It needs fxbot 0.6.0 or newer. See [Give a bot a routine](https://fxbot.sh/docs/how-to/give-a-bot-a-routine/).

## A run

- **Making one:** the owner asks in the bot's own chat, and the bot saves it with `routines_add`: five-field cron in numbers, or one local time, in the time zone in **Settings** › **General**. The reply shows a card with **Remove**. It's on at once, and waits for its first time. `routines_change` and `routines_remove` work only in that chat too, so a page a run reads or another bot's message can't add one. `routines_list` works anywhere.
- **The tick:** every 30 seconds it starts what's due, oldest first, up to `atOnce`. A firing is written down first, under a unique key on its local minute, so it happens once, across restarts and when the clocks go back. A run cut off by a restart isn't run again, since its tools may have done their work.
- **Late:** a run within half the time between its runs, from 2 minutes to 2 hours, goes ahead. Past that it's `missed`, and a backlog is one row, not a replay. A one-time routine has 24 hours.
- **The run:** a turn of the bot's own model, in a new session of the plugin's own, beside its chat, so neither waits for the other. It has every tool the bot has. It stops at `minutes`, which stops a command running on the computer too, and at `calls`.
- **No one is watching:** what a run is told says the task is the owner's say-so for what it names, and for nothing else. What it would normally ask about first, it leaves undone, and says so. When a step needs the owner, it stops and says what it needs. On a computer that's `computer_ask_owner`: the run ends, the owner takes the computer and hands it back, and the bot goes on in its own chat.
- **Telling the owner:** one turn in the bot's own chat, shown as the routine's name, with the bot's tools off, so nothing a run read reaches them. What the run saved goes with it, up to 5 files, with text files under 100 KB, and the rest are named. A run that ends with `(no reply)` or no text stays quiet.
- **Failures:** the first in a row tells the owner, and after `failures` in a row the routine pauses and tells them. The next firing is the retry.

## The section

**Routines**, in each bot's settings, lists its routines with their schedule in words, their next time, their task, and their 5 newest runs, with a switch, **Run now**, **Stop**, **Remove**, **Show**, and each run's files. To make or change one, the owner asks the bot.

## Settings

| Setting | What it is | Default |
| --- | --- | --- |
| `minutes` | The most minutes one run takes, 1 to 240 | `15` |
| `calls` | The most tool calls one run makes, 1 to 1,000 | `100` |
| `everyMinutes` | The fewest minutes between a routine's runs, 5 to 1,440 | `15` |
| `routines` | The most routines a bot can have, 1 to 100 | `20` |
| `atOnce` | The most runs going at one time, 1 to 10 | `3` |
| `failures` | Failures in a row before a routine pauses, 1 to 100 | `10` |
| `keepRuns` | How many of a routine's runs to keep, 1 to 200 | `20` |

A value outside its range means its default, with a line in the plugin's log.

## Tables

In the plugin's own schema, `plugin_routines`, from `fxbot/migrations/0001_routines.sql`:
- `routines`: each saved task, its schedule, its next time, and its failures in a row
- `runs`: each firing, its state, what it said, and what it saved, unique by routine and local minute

## Cost

- **Each message:** one in-memory check per tool call. Every request of every bot carries the four tools' definitions, about 300 tokens, cached with the rest.
- **Idle:** one indexed read every 30 seconds.
- **A run:** one turn of the bot's own model, with no chat history, and as many tool calls as the task takes. On a computer, it starts the computer if it's stopped.
- **Telling the owner:** one turn at the chat's full context, plus any text files it carries. A quiet run costs none. A morning summary is two turns a day.
- **Storage:** each run's session stays in Postgres, since nothing deletes one yet. A small run and its told turn took about 44 KB, measured over 20 runs, so a daily routine adds about 16 MB a year, and one every 15 minutes about 1.5 GB. Removing the plugin drops its tables, and what runs said stays in `chat_history`.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, its parts, and its settings |
| `fxbot/schedule.ts` | Cron, one-time schedules, and words, with no fxbot imports |
| `fxbot/server.ts` | The tick, a run, telling the owner, the four tools, and the routes |
| `fxbot/migrations/0001_routines.sql` | Its two tables |
| `fxbot/page.jsx` | The Routines section, and the card in a reply |
| `fxbot/page.js` | `page.jsx`, built |
| `package.json` | `"type": "module"`, for the server code |

Build `page.js` from this folder with:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
