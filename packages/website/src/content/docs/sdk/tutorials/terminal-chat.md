---
title: "Build a terminal chat"
description: "In this tutorial you build a small app on the fxbot SDK: a chat with a bot in your terminal. Its replies print as they're written, and the bot remembers what you tell it, across runs."
---

In this tutorial you build a small app on the fxbot SDK: a chat with a bot in your terminal. Its replies print as they're written, and the bot remembers what you tell it, across runs.

You need:

- Node 22.18 or newer, and git.
- podman, or docker, with Compose. They run the database and the local embedder.
- A model. This tutorial uses [Ollama](https://ollama.com) with `qwen3:8b` pulled (`ollama pull qwen3:8b`). An API key works too: see step 3.

## 1. Make the project

The SDK is TypeScript source in fxbot's repository. Your project holds a copy of the repository, and an npm workspace links the SDK into it:

```sh
mkdir my-bot && cd my-bot
git clone --depth 1 https://github.com/iammrduncan/fxbot
```

Make `package.json`:

```json
{
  "name": "my-bot",
  "private": true,
  "type": "module",
  "workspaces": ["fxbot/packages/sdk"],
  "dependencies": { "@fxbot/sdk": "*" }
}
```

Then install it:

```sh
npm install
```

npm links `node_modules/@fxbot/sdk` to `fxbot/packages/sdk`, and installs what it needs, libfx among them.

## 2. Start the database and the embedder

The SDK keeps its records in Postgres with pgvector, and memory search uses a local embedder. fxbot's compose file for a checkout runs both. Make a key that seals secrets, and a `.env` that both the compose file and your app read:

```sh
openssl rand -base64 32 > secret.key && chmod 400 secret.key
pw=$(openssl rand -hex 16)
printf '%s\n' "FXBOT_DB_PASSWORD=$pw" "FXBOT_DATABASE_URL=postgres://fxbot:$pw@127.0.0.1:5433/fxbot_dev" \
  FXBOT_EMBED_URL=http://127.0.0.1:8081/v1 FXBOT_SECRET_KEY_FILE=secret.key > .env
podman compose -f fxbot/deploy/compose.dev.yaml --env-file .env up -d    # or: docker compose
```

The database listens on 127.0.0.1:5433, and the embedder on 8081. On its first start, the embedder downloads its model, 310 MB.

## 3. Write the chat

Make `chat.ts`:

```ts
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createFxbot } from "@fxbot/sdk";
import type { StreamLine } from "@fxbot/sdk/client";

const fxbot = await createFxbot({
  databaseUrl: process.env.FXBOT_DATABASE_URL!,
  secretKey: readFileSync(process.env.FXBOT_SECRET_KEY_FILE!, "utf8"),
  embedUrl: process.env.FXBOT_EMBED_URL,
  syncRegistry: false,
});

// A provider and a bot: made on the first run, and found on the next.
const provider = (await fxbot.providers.list())[0] ?? (await fxbot.providers.add({ kind: "ollama", model: "qwen3:8b" }));
const bot =
  (await fxbot.profiles.list()).find((p) => p.name === "Scout") ??
  (await fxbot.profiles.create({ name: "Scout", provider: provider.id, instructions: "You are Scout. Keep answers short." }));

// The bot's chat, line by line. The stream starts with the whole chat so far, so only this run's messages are printed.
const ours = new Set<string>();
let turnEnded = () => {};
async function listen() {
  const reader = (await fxbot.stream(bot.id)).getReader();
  const decoder = new TextDecoder();
  void (async () => {
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const lines = (rest + decoder.decode(value, { stream: true })).split("\n");
      rest = lines.pop()!;
      for (const text of lines.filter(Boolean)) {
        const line = JSON.parse(text) as StreamLine;
        if (!line.messageId || !ours.has(line.messageId)) continue;
        if (line.type === "text_delta" && line.delta) process.stdout.write(line.delta);
        if (line.type === "tool_start") process.stdout.write(`[${line.name}] `);
        if (line.type === "turn_end") (process.stdout.write("\n"), turnEnded());
      }
    }
  })();
  return reader;
}

// Each line you type is a message. The next prompt waits for the reply to end.
let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
const input = createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
input.prompt();
for await (const text of input) {
  if (text.trim() === "/quit") break;
  if (text.trim()) {
    const messageId = crypto.randomUUID();
    ours.add(messageId);
    const ended = new Promise<void>((resolve) => (turnEnded = resolve));
    process.stdout.write("scout> ");
    await fxbot.send(bot.id, { text, messageId });
    reader ??= await listen();
    await ended;
  }
  input.prompt();
}
input.close();
await reader?.cancel();
await fxbot.close();
```

What it does:

- **`createFxbot`** connects to Postgres, brings the database up to date, and starts the agents. `syncRegistry: false` skips the sync of the MCP registry's mirror at start, which this app doesn't use.
- **The provider and the bot** are made once and kept in the database. With an API key, add `{ kind: "openai", apiKey: process.env.OPENAI_API_KEY!, model: "<a model your key can use>" }` instead, and put the key in `.env`. The SDK checks the key, and seals it before it's stored.
- **`fxbot.stream`** is the bot's chat as lines of JSON: the whole chat so far, then each new line as it happens. A message's reply comes as `text_delta` lines, a tool call as `tool_start` and `tool_end`, and the end as `turn_end`.
- **`fxbot.send`** resolves once the message is stored. The reply comes on the stream, which `listen` opens after the first message: a bot's chat starts with its first message, and for a bot with no chat yet, the stream ends at once.

## 4. Run it

```sh
node --env-file=.env chat.ts
```

```text
you> Hi Scout, what can you do?
scout> I can chat, search what we've said before, and remember what matters to you.
you> /quit
```

Quit with `/quit` or Ctrl+D, between replies.

## 5. Watch it remember

Tell it something worth keeping:

```text
you> Remember that I work in Mountain Time.
scout> [memory_save] Noted: you work in Mountain Time.
```

`[memory_save]` is the bot using its tool. Run the app again, and ask:

```text
you> What time zone am I in?
scout> Mountain Time.
```

The newest memories are in the bot's instructions on every turn. Whether a bot saves a fact on its own depends on its model, and a small local model saves less often than a large one.

## What's next

- [Stream replies](/sdk/how-to/stream-replies/), with thinking and tool calls as well as text.
- [Give bots tools](/sdk/how-to/tools/) from MCP servers and skills.
- [Build a page on the client](/sdk/how-to/web-page/), on an fxbot server.
- [How the SDK works](/sdk/explanation/how-it-works/), under your app.
