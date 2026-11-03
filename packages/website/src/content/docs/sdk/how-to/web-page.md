---
title: "Build a page on the client"
description: "Build a web page of your own on @fxbot/sdk/client, against fxbot's server. The client is a typed wrapper for the server's HTTP API, with the stream reader and applyLine. It carries no credentials: keys go to the server once and never come back."
---

Build a web page of your own on `@fxbot/sdk/client`, against fxbot's server. The client is a typed wrapper for the server's HTTP API, with the stream reader and `applyLine`. It carries no credentials: keys go to the server once and never come back.

You need:

- fxbot's server, running: a release install, which answers on 127.0.0.1:8787, or `npm run server` in a [checkout](/docs/how-to/checkout-beside-release/).
- A project with the SDK as a workspace: steps 1 to 3 of [Use the SDK in a project](/sdk/how-to/set-up/). A page needs no database or key of its own.

The steps use [Vite](https://vite.dev), as fxbot's own page does. It compiles the client's TypeScript along with yours.

1. Install Vite:

   ```sh
   npm install -D vite
   ```

2. Proxy `/api` to fxbot's server, in `vite.config.ts`:

   ```ts
   import { defineConfig } from "vite";

   export default defineConfig({
     server: {
       proxy: { "/api": { target: "http://127.0.0.1:8787" } },
     },
   });
   ```

   The server refuses a write whose `Origin` doesn't match its `Host`, and sends no CORS headers. So the page reaches it through a proxy on the page's own origin. Use the object form: Vite's string form, `"/api": "http://127.0.0.1:8787"`, sets `changeOrigin`, which sends the server's own host, and every write fails.

3. Write `index.html`:

   ```html
   <!doctype html>
   <meta charset="utf-8" />
   <title>My bot</title>
   <pre id="log"></pre>
   <form><input name="text" autocomplete="off" /></form>
   <script type="module" src="/main.ts"></script>
   ```

4. Write `main.ts`. It shows the first bot's chat, and sends what you type:

   ```ts
   import { applyLine, createClient, type Turn } from "@fxbot/sdk/client";

   const client = createClient(); // the page's own origin
   const log = document.querySelector("#log")!;
   const form = document.querySelector("form")!;
   const input = form.querySelector("input")!;

   const [bot] = await client.profiles.list();
   let turns: Turn[] = [];

   form.addEventListener("submit", (event) => {
     event.preventDefault();
     const text = input.value.trim();
     input.value = "";
     if (text) client.send(bot.id, { text, messageId: crypto.randomUUID() }).catch((error) => alert(error.message));
   });

   // Replays the chat, then each new line. It reconnects by itself after a drop.
   for await (const line of client.stream(bot.id)) {
     turns = applyLine(turns, line);
     log.textContent = turns.map((t) => `> ${t.text}\n${t.reply}${t.note ? `\n(${t.note})` : ""}`).join("\n\n");
   }
   ```

5. Start it, and open the address Vite prints:

   ```sh
   npx vite
   ```

The page needs a bot. Make one in fxbot's own page, or from yours with `client.profiles.create({ name, provider })`.

## What the client does

- Each call throws an `Error` with the server's message, or `Cannot reach the server.` when no answer comes.
- `client.stream(id, { cursor, signal, onConnection, onCaughtUp })` replays the chat from `cursor`, 0 by default, then waits for new lines. `onCaughtUp` hears the replay end. After a drop, it asks again from the last cursor every 2 seconds, and `onConnection` hears it go and come back. It hides lines from an older epoch, as libfx asks. Abort `signal` to stop it.
- `send` resolves once the server has stored the message. The reply comes on the stream.
- `client.providers.add({ kind, apiKey })` sends a key once. A listed provider says only `hasKey`.
- `createClient({ onVersion })` hears the server's version on every answer, so a page can notice a new release.

Every call is in [The client](/sdk/reference/client/), and the routes behind them in [HTTP API](/sdk/reference/http-api/).

## In production

Build the page:

```sh
npx vite build
```

Then serve `dist/` and `/api` from one origin, with a reverse proxy in front of both. It must pass the `Host` header on as the browser sent it, and pass the stream's lines on as they come, without buffering. fxbot's server has no login of its own, and the client sends no credentials, so whoever reaches the page can use all of fxbot through it. Where to put it: see [Reach fxbot from other devices](/docs/how-to/reach-it/).

## If it doesn't work

- **Writes fail with `This request came from another site.`** The proxy changed `Host`, or the page calls the server from another origin. Use the object form in step 2, without `changeOrigin`.
- **Every call says `Cannot reach the server.`** The proxy can't reach fxbot's server, or something answered with a page that isn't JSON. Check that `curl http://127.0.0.1:8787/api/health` answers.
- **A reply shows up all at once, at its end.** A proxy holds the stream back. Turn buffering off for `/api/profiles/<id>/stream`.
- **The chat stays empty.** The bot has no chat until its first message. The stream asks again every 2 seconds, and shows it once you send one.
