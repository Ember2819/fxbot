# /fresh

`/fresh <where to go next>` changes the topic. The bot summarizes the chat so far with that new direction in mind, keeping the facts that matter and dropping the threads that don't. Its chat starts again from that summary, and gets the owner's message as the first one.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word.

## Core or plugin

**Both, kept small.**
- **Core: starting a chat over from a summary.** "Context that fits the model" is core ([CONVENTIONS](../../CONVENTIONS.md#core-or-plugin)), and core already does this once: a provider switch summarizes the chat and starts a new session from the summary (`switchProvider`, `packages/sdk/src/index.ts`). This phase makes that a call of its own, which takes what the summary should aim at, and gives it to plugins. [Context management](context-management.md) will use the same call when it summarizes a full chat by itself.
- **The plugin, `fresh`:** the command, its prompt, and where it shows.

## How it works

1. The owner types `/fresh` and the new direction, such as `/fresh let's plan the trip to Lisbon instead`, in a bot's own chat. The composer's `/` menu lists `/fresh` beside the skills.
2. The plugin's `message` hook sees the command and answers `{ handled: true }` right away, so no turn runs on the old chat. A `/fresh` in a plugin's session, such as a room's, passes through untouched.
3. In the background, the plugin calls `fx.chats.startOver(bot, { focus })`, with `focus` being the owner's words.
4. Core summarizes the chat as a provider switch does, from the session's own checkpoint on its provider or else from the stored messages, but with an ask aimed at `focus`:
   > The owner is changing direction: «focus». Summarize this conversation so a fresh chat can start toward that. Keep what bears on it, and what always holds: who the owner is, their preferences, standing decisions, and constraints. Keep open tasks only if they still matter. Leave out threads that don't. Write it as notes for yourself, at most 600 words.
5. Core starts a new session for the bot, with the summary as its handoff: "Earlier conversation, summarized when the owner started fresh: …". It's the same handoff a provider switch leaves. The bot reads it in its instructions, and finds older messages with `chat_history`.
6. The plugin sends the owner's words to the new session with `fx.chats.send`. The bot answers there, in the bot's own chat, marked From fresh.

**On the page.** The chat already shows a provider switch's handoff, with earlier chats readable above it (`Handoff`, `packages/ui/src/app.tsx`). After `/fresh`, it shows the same thing, and the stream moves to the new session. Today the page reads the bot's session only when the chat opens, so core's stream gains a last line on the old session, `{ "type": "moved" }`. On that line, the page reads the bot again and opens the new session's stream. A provider switch made from another device gets the same fix.

**While it works** (10 to 60 seconds, a summary's time), the owner's `/fresh` message shows as sent, with "Starting fresh…" below it from the plugin's composer part, until the move arrives.

**If the summary fails,** nothing changes: the chat stays where it was, and the plugin says why in a note under the message.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/history.ts` | `summarize` takes the ask, instead of always its own | about 5 |
| `packages/sdk/src/index.ts` | `startOver(profile, { focus, handoffNote })`, out of `switchProvider`, which now calls it; `fxbot.chats.startOver(bot, { focus })` | about 30, about 20 of them moved |
| `packages/sdk/src/plugin-api.ts`, `plugins.ts` | `fx.chats.startOver(bot, { focus })`, for a bot the plugin is on for | about 10 |
| Stream | The old session's `moved` line | about 10 |
| `packages/ui` | The chat follows `moved`; `app.command(name, description)` puts a plugin's command in the composer's `/` menu | about 35 |
| `plugins/fresh` | `plugin.json`, the hook, the send, the page part, README | about 100 |
| Website | Plugin API: `fx.chats.startOver`, `app.command`; the stream's `moved` line; fxbot's list gains `fresh` | about 25 |

Size: about 100 core lines and a 100-line plugin. One summary per `/fresh`, on the bot's own model. Nothing runs until someone types it.

## Checks

- `/fresh plan the Lisbon trip` in a long chat: the handoff shows the kept facts and none of the dropped threads; the bot answers about Lisbon; earlier messages show above it, and `chat_history` finds them.
- `/fresh` alone starts over with a general summary and sends nothing.
- A second `/fresh` chains: the new summary includes what the first one kept, as a provider switch's does.
- A provider whose summary fails leaves the chat as it was, with the note.
- Two pages open on the bot both move to the new session.
- `/fresh` in a room passes through to the room as text.
- With the plugin removed, `/fresh` is an ordinary message, and the `/` menu doesn't list it.

## Questions

None open.
