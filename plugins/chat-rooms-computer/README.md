# chat-rooms-computer

A plugin for [fxbot](https://fxbot.sh): a computer for a chat room, which the room's bots share.

- **Turn it on** with the screen button at the top of a room, beside **Edit**. The room's bots then use the room's computer in the room, and their own computers in their own chats. Its hostname is the room's name and `-computer`.
- **Taking turns.** A room runs one bot's turn at a time, so the bots take turns on the machine. Each turn's instructions say the computer is shared, and with whom, and to look before acting.
- **Open** shows it on the computer's own screen, with an arrow where each bot last pointed. Each bot's `computer_desktop` results say where the others last were.
- **A skill,** `room-computer`, goes with a bot's first room turn after it's on: look first, keep a browser tab of your own (`agent-browser tab new --label <name>`), leave the terminal at a prompt, keep your files in `/root/<name>/`, and say in the room what you did.
- **Asking for help.** A bot that needs you calls `computer_ask_owner`. Take over, do it, hand it back, and tag the bot in the room to go on.
- **Off** stops the computer and keeps its home, for the next time it's on. Deleting the room deletes its computer, on the computer's next sweep, and so does removing this plugin.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. It needs the computer and chat rooms, 0.3.0 of each, and fxbot 0.5.0 or newer. See [Give a room a computer](https://fxbot.sh/docs/how-to/give-bots-a-computer/#give-a-room-a-computer).

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, version, parts, and what it needs |
| `package.json` | `"type": "module"`, for the server code |
| `fxbot/server.ts` | `computerFor` and `computers` for the computer, the room turns' instructions and skill, and its routes, under `/api/plugins/chat-rooms-computer/rooms/<id>` |
| `fxbot/migrations/0001_computers.sql` | Its table: each room's computer's key, and whether it's on |
| `fxbot/page.jsx` | The room header's screen button and its dialog, in chat rooms' `chat-rooms.room-header` place |
| `fxbot/page.js` | The page, built |
| `skills/room-computer/SKILL.md` | How to share the room's computer |

## Build the page

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. It bundles nothing else. Run this in this folder, in a checkout of fxbot, after changing the page:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
