# chat-rooms

A plugin for [fxbot](https://fxbot.sh): rooms where several of your bots talk with you.

- **Rooms** in the sidebar lists your rooms. **+** makes one: name it, and pick its bots in the order they answer.
- Each of your messages starts a round. Each bot in the room answers once, in that order, and sees what was said since its last turn, the other bots' replies among it. Bots never start a round, so a room never runs on by itself.
- Each bot answers in a session of its own for the room, so a room stays out of the bot's own chat. Its `chat_history` tool still finds what was said there.
- **Edit**, on a room, changes its bots or deletes it.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, version, and parts |
| `fxbot/server.ts` | Its routes, under `/api/plugins/chat-rooms/`, the rounds, and the instructions that tell a bot which room it's in |
| `fxbot/migrations/0001_rooms.sql` | Its tables, in the schema `plugin_chat_rooms` |
| `fxbot/page.jsx` | The sidebar group and the room screen |
| `fxbot/page.js` | `page.jsx`, built |

## Build the page

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. Run this in this folder, in a checkout of fxbot, after changing `page.jsx`:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```

React and `@fxbot/app` stay out of the bundle: the page hands over its own.
