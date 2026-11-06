---
title: "Stream replies"
description: "Show a bot's reply while it's written, in a Node app on @fxbot/sdk. fxbot.send() resolves once libfx has stored the message. The reply comes on fxbot.stream(): the bot's chat as NDJSON, one JSON object per line, which applyLine from @fxbot/sdk/client folds into turns."
---

Show a bot's reply while it's written, in a Node app on `@fxbot/sdk`. `fxbot.send()` resolves once libfx has stored the message. The reply comes on `fxbot.stream()`: the bot's chat as NDJSON, one JSON object per line, which `applyLine` from `@fxbot/sdk/client` folds into turns.

In a page or a script on fxbot's server, the client's `stream()` does all of this for you: see [Build a page on the client](/sdk/how-to/web-page/).

## Read a reply

1. Add a reader that turns the stream's bytes into lines:

   ```ts
   import type { Fxbot, StreamLine } from "@fxbot/sdk";

   // Every line of a bot's chat after `cursor`, parsed, until the loop that reads it stops.
   async function* lines(fxbot: Fxbot, botId: string, cursor = 0): AsyncGenerator<StreamLine> {
     const reader = (await fxbot.stream(botId, cursor)).getReader();
     const decoder = new TextDecoder();
     let rest = "";
     let epoch = 0;
     try {
       for (;;) {
         const { value, done } = await reader.read();
         if (done) return;
         const parts = (rest + decoder.decode(value, { stream: true })).split("\n");
         rest = parts.pop()!;
         for (const part of parts) {
           if (!part) continue;
           const line: StreamLine = JSON.parse(part);
           // libfx's rule: hide a line whose epoch is lower than one before it.
           if (line.epoch !== undefined && line.epoch < epoch) continue;
           epoch = line.epoch ?? epoch;
           yield line;
         }
       }
     } finally {
       await reader.cancel();
     }
   }
   ```

   A chunk can end in the middle of a line, so the last piece waits for the next chunk. Leaving the loop that reads the lines cancels the stream.

2. Send a message, with an id you make:

   ```ts
   const messageId = crypto.randomUUID();
   await fxbot.send(bot.id, { text: "What's on today?", messageId });
   ```

   An id is 1 to 128 letters, digits, `.`, `_`, or `-`. The same id again reaches the same turn and runs nothing new, so you can send again after a failed request.

3. Read the chat, fold each line into the turns, and print the reply's text as it comes:

   ```ts
   import { applyLine, type Turn } from "@fxbot/sdk/client";

   let cursor = 0;
   let turns: Turn[] = [];

   for await (const line of lines(fxbot, bot.id, cursor)) {
     cursor = line.cursor ?? cursor;
     turns = applyLine(turns, line);
     if (line.messageId !== messageId) continue;
     if (line.type === "text_delta") process.stdout.write(line.delta ?? "");
     if (line.type === "turn_end") break;
   }

   const turn = turns.find((t) => t.messageId === messageId)!;
   if (turn.note) console.error(turn.note);
   ```

   The stream replays the chat from the cursor, then stays open for new lines. From 0, it replays the whole chat, so the loop skips lines of other turns. It stops at the `turn_end` of this message.

4. Keep `cursor` for the next message. A stream opened from it starts after the last line you read, so the next reply comes without a replay.

`applyLine` gives one `Turn` per message: its `text`, its `reply` text, its `parts` in order (thinking, text, and tool calls with their input and result), and `done` once its `turn_end` has come. `note` says how a turn ended when it didn't end normally, such as `Error: …` or `Stopped: max_output_tokens`. All the fields are in [The client](/sdk/reference/client/).

## The lines

Each line has a `type`. A line of a turn has the turn's `messageId`, and every line has a `cursor`.

| Type | What it carries |
| --- | --- |
| `turn_start` | A turn began. `input` is the message's text, and `files` the files it sent. |
| `text_delta` | The next piece of the reply, in `delta`. |
| `reasoning_delta` | The next piece of the model's thinking, in `delta`, when the provider sends it. |
| `tool_start` | A tool call: its `id`, `name`, and `input`, or `inputPreview` for an input over 64 KiB. |
| `tool_end` | The call's result, by the same `id`: `content`, and `isError` when it failed. |
| `user_message` | A message joined the running turn, whose `messageId` this has. `id` is the message's own, `text` its words, and `files` and `from` as on `turn_start`. Since 0.6.0. |
| `turn_end` | The turn ended, and `stopReason` says how: `end_turn` normally, another reason such as `max_output_tokens`, or `error`, with the reason in `error`. |
| `turn_resume` | A turn left open by a stopped process runs again. Its reply starts over. |

libfx writes more types, such as `idle`, which has no `messageId`. `applyLine` passes over the lines it doesn't use.

## Pick up after a restart

When your app starts, `createFxbot` runs again any turn that a stopped process left open. Its lines come with `turn_resume`, and `applyLine` starts its reply over.

Save `cursor` where your app keeps its state. After a restart, or when a stream ends early, open the stream again from that cursor.

## Pass the stream on over HTTP

A server can hand the stream to its own clients as it is. This is what fxbot's server does at `/api/profiles/<id>/stream?cursor=<n>`, which the client's `stream()` reads:

```ts
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

const body = await fxbot.stream(botId, Number(url.searchParams.get("cursor") ?? 0));
res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" }).flushHeaders();
// A closed response cancels the stream.
await pipeline(Readable.fromWeb(body as ReadableStream<Uint8Array>), res).catch(() => {});
```

## If it doesn't work

- **The stream ends at once, with no lines.** The bot has no chat yet, or its provider is gone. Send the first message before you open the stream.
- **`send` fails with status 400.** The message has no text, its id breaks the rules in step 2, or the bot has no provider or model. The error says which.
- **The script crashes with `CONNECTION_ENDED` right after a reply.** Before 0.4.0, `close()` didn't wait for the SDK to save a reply that just finished. Update the SDK, or keep the app running between turns and call `close()` when it shuts down.
- **The reply shows twice.** A turn ran again after a restart: its `turn_resume` line starts the reply over. Fold lines with `applyLine` rather than adding up `text_delta`s yourself.
