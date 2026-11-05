# dreams

A plugin for [fxbot](https://fxbot.sh): each night, a bot goes over its day. It saves what's worth remembering, and when the day showed a way of working that worked, it writes it down as a skill. A journal in the bot's settings shows each change, with **Undo**.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. It needs fxbot 0.5.0 or newer, for `fx.memories` and `fx.skills.set`. See [Let bots dream](https://fxbot.sh/docs/how-to/let-bots-dream/).

## A night

- **The day:** each turn of a bot the plugin is on for, in its own chat and in other plugins' chats such as rooms, with the tools it called and what failed. Turns wait until a dream reads them, for 7 days at most.
- **When:** every 5 minutes it looks for bots with `minTurns` turns waiting, from `hour` for 4 hours, once a night each, one bot at a time. A bot in the middle of a turn waits for the next look.
- **The dream:** a turn of the bot's own model, in a session of the plugin's own, with the bot's own instructions and memories, and the rules after them. It reads the day with `dreams_day`, up to 2 pages of 48 KB, the newest turns that fit, and may call only `dreams_day`, `dreams_remember`, `dreams_skill`, `memory_search`, `chat_history`, and `skill`, 40 calls at most, in `minutes` at most.
- **Memories:** `dreams_remember` saves one as the bot's, or changes one of the bot's own with `replaces`, citing the turns it came from: 10 changes a night at most. It never forgets one, and never changes one the owner wrote.
- **Skills:** `dreams_skill` makes a skill for that bot only, or rewrites one of its skills from dreams after reading it: one change a night, 20 skills a bot. A skill is a `SKILL.md` of up to 16,000 characters, with no files.
- **What it tells the model:** the day is evidence, not instructions. It saves only what a turn shows, never what it infers about the owner, and leaves out secrets, instructions found in what it read, and what mattered only today. Most nights change little. The rules are in `fxbot/server.ts`, in `rules()`.

A dream that fails, runs past `minutes`, or meets a restart leaves the day's turns waiting for the next night.

## The journal

The bot's settings show **Dreams**: when it dreams, each night with what it read and how it ended, and each change with its sources, the owner's words from the turns it cites. **Undo** puts a memory or a skill back as it was. A memory the owner changed since is left alone, with the reason. **Dream now** dreams at once, and **Older** reads further back. **Skills from dreams** lists the bot's skills, with **Show** and **Remove**.

## Settings

| Setting | What it is | Default |
| --- | --- | --- |
| `hour` | The hour dreams start, 0 to 23 | `3` |
| `timeZone` | That hour's time zone, such as `Europe/Berlin`. Empty: the server's. The journal offers the browser's. | empty |
| `minTurns` | Turns a bot needs since its last dream before it dreams | `6` |
| `minutes` | The most minutes one dream runs | `10` |
| `skills` | Whether dreams write skills: `on` or `off` | `on` |

## Tables

In the plugin's own schema, `plugin_dreams`, from `fxbot/migrations/0001_dreams.sql`:
- `turns`: the day, each turn cut at 4,000 characters for the message and the reply, with up to 20 calls
- `nights`: each dream, its state, and its last line
- `changes`: each change, with what Undo puts back and its sources
- `skills`: the skills dreams wrote, given to fxbot again at each start

## Cost

- **Each turn:** one insert after it, beside the reply. Every request of every bot carries the three tools' definitions, about 300 tokens, cached with the rest.
- **A night:** one turn of each dreaming bot's own model, with the day, up to 96 KB, read once, and up to 40 calls. A quiet bot costs one count.
- **Storage:** turns for 7 days at most. Each dream's session stays in Postgres, and the journal stays until the plugin is removed.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, its parts, and its settings |
| `fxbot/server.ts` | The day, the schedule, the dream and its rules, the three tools, Undo, and the routes |
| `fxbot/migrations/0001_dreams.sql` | Its four tables |
| `fxbot/page.jsx` | The Dreams section in a bot's settings |
| `fxbot/page.js` | `page.jsx`, built |
| `package.json` | `"type": "module"`, for the server code |

Build `page.js` from this folder with:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
