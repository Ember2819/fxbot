---
title: "Write a plugin"
description: "A plugin changes fxbot itself: server code that runs in fxbot's own process, and as much as it needs of page code, tables, settings, skills, and remote MCP servers. This guide writes one in a checkout of fxbot, which loads it from its folder and again each time you change it, then publishes it on GitHub. Every call is in Plugin API."
---

A plugin changes fxbot itself: server code that runs in fxbot's own process, and as much as it needs of page code, tables, settings, skills, and remote MCP servers. This guide writes one in a checkout of fxbot, which loads it from its folder and again each time you change it, then publishes it on GitHub. Every call is in [Plugin API](/sdk/reference/plugin-api/).

You need a checkout of fxbot that runs with `npm run dev`: see [Run from a checkout](https://github.com/iammrduncan/fxbot#run-from-a-checkout) in the README.

## 1. Make the plugin

1. Make its folder:

   ```sh
   mkdir -p my-plugins/hello/fxbot
   ```

2. Write `my-plugins/hello/plugin.json`:

   ```json
   {
     "name": "hello",
     "version": "0.1.0",
     "description": "Greets people",
     "extensions": {
       "sh.fxbot": { "server": "./fxbot/server.ts" }
     }
   }
   ```

   The name is the plugin's id in fxbot: up to 40 lowercase letters, digits, and dashes. Bots see its tools as `hello_<tool>`, its routes are under `/api/plugins/hello/`, and its tables are in the schema `plugin_hello`. fxbot's own fields go under `sh.fxbot`, so the rest of the file stays the [Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) manifest that other agents read.

3. Write `my-plugins/hello/fxbot/server.ts`:

   ```ts
   import type { PluginApi } from "@fxbot/sdk";

   export default function setup(fx: PluginApi) {
     let greeted = 0;

     // A tool, which bots see as hello_greet.
     fx.tool({
       name: "greet",
       description: "Greet someone by name",
       inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
       idempotent: true,
       execute: (input: { name: string }) => (greeted++, `Hello, ${input.name}!`),
     });

     // A line in the instructions of every chat it's on for.
     fx.on("instructions", (event) => {
       event.instructions.push("When someone asks you to greet a person, use hello_greet.");
     });

     // A route, at /api/plugins/hello/count.
     fx.route("GET", "/count", () => Response.json({ greeted }));
   }
   ```

   The import is for types only: Node erases it, so the plugin needs nothing installed to run. For an editor's types, open the folder in a project that has the SDK, as in [Use the SDK in a project](/sdk/how-to/set-up/).

## 2. Load it

1. Name its folder in the checkout's `.env`, as an absolute path. Separate more than one with `:`.

   ```sh
   FXBOT_PLUGIN_DIRS=/path/to/my-plugins/hello
   ```

2. Start `npm run dev` again. fxbot adds the plugin on first sight, and the API's output says `[plugin hello] loaded 0.1.0`. It's in **Plugins**, under **Installed**.
3. Ask a bot to greet someone. Its reply shows a call of `hello_greet`.
4. Read the count from the route:

   ```sh
   curl http://127.0.0.1:8788/api/plugins/hello/count
   ```

Change `server.ts`, and fxbot loads the plugin again a moment later. A plugin whose setup throws stays added but off, with the error on its row in **Plugins**, and in its log.

## 3. Add a page

1. Write `fxbot/page.jsx`. It gets React and `@fxbot/app` from the page:

   ```jsx
   import { useEffect, useState } from "react";
   import { api, ui } from "@fxbot/app";

   function Count() {
     const [greeted, setGreeted] = useState(null);
     useEffect(() => {
       api("/count").then((res) => res.json()).then((body) => setGreeted(body.greeted));
     }, []);
     return (
       <div className="flex h-full flex-col">
         <ui.Header title="Hello" />
         <main className="px-4 py-6">Greeted {greeted ?? "…"} times.</main>
       </div>
     );
   }

   export default function setup(app) {
     app.nav({ label: "Hello", path: "/count" });
     app.route("/count", Count);
   }
   ```

2. Build it into one CommonJS file that leaves React and `@fxbot/app` out. [rolldown](https://rolldown.rs) comes with the checkout's packages:

   ```sh
   npx rolldown /path/to/my-plugins/hello/fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file /path/to/my-plugins/hello/fxbot/page.js
   ```

   Run it in the checkout, where `npx` finds rolldown.

3. Name it in `plugin.json`, beside `server`: `"page": "./fxbot/page.js"`.
4. Reload the page. The sidebar's footer has an **H** button, which opens `/hello/count`.

The page's styles hold only the classes the app uses. The app's components, in `ui`, bring their own looks. For more, name a CSS file in `plugin.json` as `css`.

## 4. Keep data

1. Name a folder of migrations in `plugin.json`: `"migrations": "./fxbot/migrations"`.
2. Write `fxbot/migrations/0001_greetings.sql`:

   ```sql
   create table greetings (name text not null, at timestamptz not null default now());
   ```

3. Use the table with `fx.sql`, which is in the plugin's own schema:

   ```ts
   execute: async (input: { name: string }) => {
     await fx.sql`insert into greetings (name) values (${input.name})`;
     return `Hello, ${input.name}!`;
   },
   ```

Each file runs once, in name order, in a transaction. Add a new file for each change, and never change one that has shipped. Removing the plugin drops its schema.

## 5. Take settings

1. Declare them in `plugin.json`, under `sh.fxbot`:

   ```json
   "settings": [
     { "name": "greeting", "description": "The word to greet with", "default": "Hello" },
     { "name": "apiKey", "description": "A key for the greeting service", "isSecret": true }
   ]
   ```

2. Read them as `fx.settings.greeting`. The object stays up to date, and `fx.on("settings", …)` hears a change.

The owner sets them on the plugin's tab in **Settings**. A secret one is sealed, and the page never gets it back.

## 6. Need another plugin

A plugin can build on another. The browser plugin has no code: it gives the computer setup steps, which install a browser on every bot's computer.

1. Name the plugin you need under `sh.fxbot`'s `needs`, with an object for it. What the object holds is up to that plugin: the computer takes `setup`, a list of shell steps for its image.

   ```json
   "needs": { "computer": { "setup": ["apt-get update && apt-get install -y --no-install-recommends chromium"] } }
   ```

2. The owner adds the plugin you need first: your plugin's page says what it needs, and **Add** waits for it. Yours loads after it, and while yours is added, it can't be removed.
3. The plugin you need reads every plugin's object with `fx.dependents()`, and hears a change with `fx.on("dependents", …)`.

## 7. Say which fxbot it needs

Set `minFxbot` in `plugin.json` to the oldest fxbot your plugin runs on, and raise it when you start using something newer. The [Plugin API](/sdk/reference/plugin-api/#which-fxbot-it-runs-on) says `Since` on what's new:

```json
{ "extensions": { "sh.fxbot": { "minFxbot": "0.6.0", "server": "./fxbot/server.ts" } } }
```

An owner on an older fxbot can't add it, or update to it, and is told what it needs. When a later release breaks something your plugin uses, it shows as **Unsupported**, with what to change. Change it, raise `minFxbot` to that release, and push.

## 8. Publish it

1. Push the plugin's folder to a public GitHub repository, at its root or in a folder of it.
2. Anyone can add it from **Plugins**, on **Browse**, under **From GitHub**: `owner/repo`, or `owner/repo/folder`. That's there once they turn on unvetted plugins in Settings › Plugins, since fxbot doesn't vet it. fxbot pins it to the commit that its page showed.
3. When you push a change that touches its files, fxbot marks it **Update available** within the hour, and shows the owner what changes before it moves.

A plugin can also carry skills, as `skills/<name>/SKILL.md`, and remote MCP servers, in `mcp.json`. To ask for a place in fxbot's own list, open a pull request that adds it to `packages/sdk/src/plugins-registry.json`.
