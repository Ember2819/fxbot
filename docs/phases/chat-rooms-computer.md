# A computer for each room

`chat-rooms-computer` gives a chat room a computer of its own. Every bot in the room works on that one machine, with one desktop, one terminal, one browser, and one home. The owner watches the room's desktop beside the room, and sees each bot's cursor, labeled with its name.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word, as a plugin of its own that needs the [computer](../_completed/phases/computer.md) and [chat rooms](../_completed/phases/chat-rooms.md). Two questions below need the owner before it's built.

## Core or plugin

**A plugin**, `chat-rooms-computer`, which needs `computer` and `chat-rooms`. It also needs changes in those two plugins, and two small pieces of plugin API, because plugins can't talk to each other today:
- **Core, `fx.provide(api)` and `fx.need(name)`:** a plugin offers an object, and a plugin that names it under `needs` gets it. This is what [computer](../_completed/phases/computer.md) meant by `fx.need("computer")`, never built.
- **Core, a page slot:** one plugin's page can leave a named place, and another plugin can fill it. Without one, a room's screen can't show the room's computer.

## Today

All of this was read in the code. Where it was inferred instead, it says so.
- **A computer is a bot's.** Its container is `fxbot-computer-<bot>`, with a volume of the same name as its home. Every tool picks its computer from `call.bot` alone.
- **Cleanup removes strangers.** The idle sweep's `forget()` removes any computer whose key isn't a bot, so as things stand it would delete a room's computer.
- **Room turns run one at a time.** A room's queue runs one bot's turn, then the next (`drain`, `plugins/chat-rooms/fxbot/server.ts`). Each runs in a session of the room's own for that bot, so a computer tool called there sees the bot and that session.
- **Nothing serializes a computer.** Two calls at once interleave their xdotool and tmux commands. This happens today when the owner takes over while a bot works, and when libfx runs one turn's calls together (inferred from libfx's engine, not traced).
- **One pointer.** Xvnc and noVNC carry one cursor, and xdotool drives X's one core pointer.
  - X's multi-pointer mode, MPX, would need `xinput`, which isn't in the image.
  - xdotool can't choose a pointer (inferred).
  - agent-browser drives Chromium over CDP and agent-desktop mostly over AT-SPI, and neither moves the X pointer (inferred).

## How it works

- **A room gets a computer** when the owner turns on **Computer** in the room's header. Turning it off stops the computer and keeps its home. Removing the room removes both.
- **Keys, not bots.** The computer plugin names a computer by a key. A bot's key is the bot's id, as today, so every existing computer and home stays as it is. A room's key is random, made once and kept in `chat-rooms-computer`'s table, so a room made after a reinstall never takes an old room's home.
- **Which computer a call uses.** Before each call, the computer asks the plugins that need it, through what they `provide`: "computer for this bot and session?" `chat-rooms-computer` answers with the room's key when the session is a room's and the room has a computer. Otherwise, the bot's own computer is used.
- **The machine:**
  - its hostname is the room's name and `-computer`, as a bot's is
  - the room's bots share its home, its browser and sign-ins, and its terminal
  - each bot types in a tmux window of its own, named for it, so one bot's command doesn't land in another's prompt
- **Taking turns.** A computer runs one desktop or terminal action at a time, by a lock in the computer plugin. Room turns already run one bot at a time, so the room's bots take turns on the machine, as people do on one computer. The lock also stops the race between the owner's take-over and a bot, which bots' own computers have today.
- **Cursors.**
  - The computer keeps where each bot last pointed, from `computer_desktop`'s moves and clicks, and agent-desktop's pointer commands.
  - The room's desktop view draws each one over the live screen, as a small arrow with the bot's color and name. The arrow of the bot whose turn it is shows solid, and the others faded.
  - Each desktop call's result also tells the bot where the others last were, such as "Ann last clicked (412, 300) 2 minutes ago". A bot can then leave the other's window be, even though its screenshots show only the real pointer.
  - Browser and accessibility actions move no pointer, so they show as a short "Ann: browser" label at the view's top instead.
- **The room's screen.** A panel beside the room shows the desktop live and small, with the cursors. **Open** makes it full size, with **Take over** and **Hand back** as on a bot's computer. Hand back goes to the room, which tells the bot that asked.
- **Skills.** One skill, `sharing-a-computer`: it's shared; say what you're doing before you start; leave others' windows alone, or ask; your terminal is your own window; and don't sign out of what others use.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| Core, `packages/sdk` | `fx.provide(api)`; `fx.need(name)`, for a plugin named in `needs`, read at each use since an update reloads one plugin; `dependents()` entries gain `api` | about 25 |
| Core, `packages/ui/src/plugins.tsx` | `app.slot(name, Component)` fills a place, and `@fxbot/app`'s `Slot` leaves one: `<Slot name="chat-rooms.room-header" props={{ room }} />` | about 20 |
| `plugins/computer` → 0.3.0 | Keys in place of bots in every map, route, and socket; asking dependents for a call's key; keeping the computers they list from `forget()`; the lock; a tmux window per bot on a shared computer; cursor records, in the state route and in desktop results; page parts that take a key, and the cursor overlay | about 200 |
| `plugins/chat-rooms` → 0.3.0 | `provide({ roomOf(session) })`, giving the room's id, name, and bots; a `Slot` in the room's header; a hand-back note into the room | about 20 |
| `plugins/chat-rooms-computer` → 0.1.0 | `plugin.json` needing both; its table of rooms and keys; `provide({ computerFor, computers, handBack })`; the header switch and the room panel, filled in the slot; the skill; README | about 250 |
| Website | Plugin API: `provide`, `need`, `slot` and `Slot`; Give bots a computer: a room's computer; fxbot's list gains `chat-rooms-computer` | about 40 |

Size: about 45 core lines, and about 470 in the three plugins. Nothing runs in an install without `chat-rooms-computer`: the computer asks its dependents only when it has some.

## Checks

- A room with the computer on: two bots, handing work on, both use one machine. `hostname` says the room's name; a file one writes, the other reads.
- The room's view shows both cursors, labeled, after each has clicked; the one whose turn it is shows solid.
- The owner takes over during a bot's turn: the bot's next desktop call waits, as on a bot's own computer, and goes on after Hand back.
- Each bot's terminal commands land in its own tmux window.
- The same bots, alone in their own chats, still use their own computers.
- Turn the room's computer off: it stops, and its home stays. Remove the room: both go. Remove `chat-rooms-computer`: rooms work as before, and their computers are removed on the next sweep.
- Update `computer` with `chat-rooms-computer` added: rooms find their computers again.

## Questions

1. **At once, or in turns?** Room turns run one bot at a time, so on this plan the bots take turns on the machine, and the cursors show where each one last worked. Two bots working at the same moment would need rooms to run turns in parallel, which chat rooms chose against. Even then, they'd fight over one keyboard focus on the desktop: only terminals and browser tabs could really run side by side. Is turn by turn what you meant, or do you want bots working at the same moment?
2. **Who sees the cursors?** On this plan, the owner sees every bot's cursor drawn over the live desktop, and the bots learn where the others are as text. Bots seeing the others' cursors in their own screenshots needs markers drawn in X itself: a small helper program in the image, and markers that cover what's under them. Is the owner's view enough?
