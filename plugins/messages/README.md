# messages

A plugin for [fxbot](https://fxbot.sh): the owner's bots message each other in their own chats, so one can ask another for what it knows, or hand it a job, and the owner sees the work where it happens.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. It needs fxbot 0.6.0 or newer. See [Let bots work together](https://fxbot.sh/docs/how-to/let-bots-work-together/).

## A message

- **Sending:** a bot calls `messages_send` with `to`, `text`, and optionally `reply: false` and `files`. Who it's from, its conversation, and what it answers come from the call and the rows, never from the model.
- **Where it goes:** the receiver's own chat, in a pill that opens to "From Bob" with the sender's words. A working bot takes it in where it is, through core's steering, and an idle one wakes. A message with an image waits for the running turn, since joining would end it, and so does a message to a turn that takes none.
- **What the model gets:** a frame that opens by saying this isn't from the owner, with the words quoted, what the sender can't OK, and whether a reply is expected. libfx labels every steer as the user's, so the frame is what says otherwise. When libfx lets a steer name its author, core passes it.
- **Who a bot can reach:** the others the plugin is on for, named in its instructions, each with its line from **Messages** in its settings. Any can reach any: the plugin's switch for each bot is how an owner narrows it.

## In a chat

Messages between bots fold into a pill in the middle of the chat, with each bot's face, such as **2 received, 1 sent · Philly**, through `app.fold`. A send that went counts as sent, and its card goes in the pill. One that was refused stays a card, in view. A run of them makes one pill, until the owner or the bot says something to the other, and a click opens it. A message that expects a reply folds with its turn, since that turn's answer goes to the other bot: its id is `messages-ask-<row>-<sender>`. After any other, `messages-in-<row>-<sender>`, what the bot says is for the owner, so it stays in view. The sender's id is what picks the face, so two of one name aren't confused. A turn the owner wrote into stays in view too.

## Tags

This plugin replaces the message box in a bot's chat with an editor, as a room's is. `@` at the start of a line or after a space lists the bots it can reach, each with its line, or its id if it has none. The one you pick is a chip with its face, in the sentence, which deletes as one piece. It's sent as a link, `[@Name](/profiles/<id>)`, so the bot knows exactly which one you mean, even with two of one name, and it shows as a chip in the message too. A name you type out stays plain text.

A tag names a bot, and wakes no one. The bot you're talking to does the sending, with `messages_send`, and everything here applies to it. `to` takes the whole tag, as well as a name or an id.

## Replies

A message's `reply` is `yes`, `no`, or `maybe`. A send to the bot whose message reached this turn is a reply: the plugin sets `answers` to that message, and `answered_at` on it.

When a turn a `yes` message started ends:

| How it ended | What the asker gets |
| --- | --- |
| It failed, or the owner stopped it | A note, with no reply needed |
| Its last act was a send to the asker | Nothing more |
| Its last message is empty, `(no reply)`, or libfx's `Done.` | A note: it finished without an answer |
| Otherwise | Its last message, as a `maybe`, with what the turn saved |

A `yes` message that joined a turn and stayed unanswered gets one turn of its own, `messages-again-<id>`, since that turn's last message is for someone else. A turn a `no` message reached can't message that sender. Every note is `no`, so notes don't chain.

## Limits

- **A conversation** starts when a turn no message started sends one, follows the work across bots, and stops at `conversation` messages, or at the owner's **Stop**. The count and the write are one step, under a lock, so parallel sends can't pass it. What the server sends counts too: at the budget, a last message isn't sent, and the log says so.
- **A turn** sends at most `perTurn`, raised before anything waits.
- **Two bots** send at most `perHour` between them.
- **A repeat** is one message: its key is a hash of the turn, the receiver, and the words. A call cut off by a crash runs again and lands on its row.
- **A turn a message started** stops at `minutes` and `calls`. A turn it only joined keeps whatever limits it had.

Nothing is retried. A turn has effects, and a bot can ask again.

## The screen

**Open conversations**, on the plugin's tab in **Settings**, opens `/messages`, which shows each conversation as one thread, newest first, with its count, each message's state, **Stop** while one runs, and **Older**. It reads again every 5 seconds while a message is out. A row opens that bot's chat. **Stop** marks the conversation, cancels the turns its messages started, and cancels a waiting one when it starts. The sender hears nothing, and a turn a message only joined goes on.

A send shows in the sender's reply as a card: who it's to, the words, and how it went.

## Settings

| Setting | What it is | Default |
| --- | --- | --- |
| `conversation` | The most messages in one conversation, 1 to 100 | `20` |
| `perTurn` | The most messages one turn sends, 1 to 20 | `5` |
| `perHour` | The most messages between two bots in an hour, 1 to 1,000 | `60` |
| `minutes` | The most minutes a bot works on one message, 1 to 240 | `15` |
| `calls` | The most tool calls in one message's turn, 1 to 1,000 | `100` |

A value outside its range means its default, with a line in the plugin's log.

## Tables

In the plugin's own schema, `plugin_messages`, from `fxbot/migrations/0001_messages.sql`:
- `conversations`: each thread, by the turn that began it, and when it was stopped
- `messages`: each message, its words, who it's from and to, what it answers, the turn it started or joined, and how it went
- `roles`: what each bot does, for the others

Each send deletes conversations older than 30 days. Removing the plugin drops the schema. What was said stays in the chats.

## Cost

- **Each message of any bot:** one in-memory check per tool call. Every request of every bot carries the tool's definition, about 120 tokens, cached with the rest. Plugin tools join every agent, so a bot the plugin is off for carries it too.
- **Each chat that opens:** one read of the bots and their lines, and one short entry in its instructions.
- **Idle:** nothing, but a timer for each message working.
- **A message to an idle bot:** one turn at its whole chat, cached where the provider caches. This is the cost to watch: a conversation of 20 messages is at most 20 turns.
- **A message to a working bot:** no new turn.
- **Storage:** 30 days of rows. The turns are in the chats, so a message adds no session.
- **The page:** `page.js` is about 370 KB, most of it ProseMirror, which a plugin bundles for itself.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, its parts, and its settings |
| `fxbot/server.ts` | The tool and its guards, delivery, the reply rule, limits, and the routes |
| `fxbot/migrations/0001_messages.sql` | Its three tables |
| `fxbot/page.jsx` | The Messages screen, the card in a reply, the line in a bot's settings, and a tag in a sent message |
| `fxbot/box.jsx` | The message box, with `@` and its chips |
| `fxbot/page.css` | The box's styles, and the rules ProseMirror needs |
| `fxbot/page.js` | `page.jsx` and `box.jsx`, built |
| `fxbot/page-licenses.txt` | The licenses of what `page.js` bundles |
| `package.json` | `"type": "module"`, for the server code, and what the page is built from |

Build `page.js` from this folder with these. It's built without comments, since ProseMirror's are long. When the bundled packages change, write `fxbot/page-licenses.txt` again from their `LICENSE` files.

```sh
npm install
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --no-comments --file fxbot/page.js
```
