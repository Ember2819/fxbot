---
title: "Give bots tools"
description: "Every bot comes with tools to search its own chats, keep memories, and use the library. Give bots more with plugins, through fxbot.plugins: remote MCP servers, whose tools they call, and skills, which they read. A package can carry both, with code of its own: see Write a plugin."
---

Every bot comes with tools to search its own chats, keep memories, and use the library. Give bots more with plugins, through `fxbot.plugins`: remote MCP servers, whose tools they call, and skills, which they read. A package can carry both, with code of its own: see [Write a plugin](/sdk/how-to/write-a-plugin/).

Until Settings' `unvetted` is true, `preview` and `add` take only what fxbot's own lists name, and fail with 400 for an address, a public registry's entry, or a skills.sh skill. Turn it on first: `await fxbot.settings.update({ unvetted: true })`.

## The tools every bot has

| Tool | What it does |
| --- | --- |
| `chat_history` | Searches the bot's own messages across all its chats, and reads them in full around a match. |
| `memory_save`, `memory_search`, `memory_forget` | Keep the bot's memories. See [Work with memories](/sdk/how-to/memories/). |
| `library_search`, `library_read`, `library_save` | Find, open, and save files in the library, only those tagged for the bot. |
| `skill` | Reads one of the bot's skills. Bots have it once you add a skill. |

Each tool finds its bot from the chat it runs in, never from what the model asks.

## Add an MCP server by its address

1. Look at the server first. `preview` connects without credentials, and answers with its name, how it signs in (`none`, `headers`, or `oauth`), its tools when it lists them without a sign-in, and a `hash`:

   ```ts
   import type { McpPreview } from "@fxbot/sdk";

   const ref = { url: "https://mcp.example.com/mcp" };
   const page = (await fxbot.plugins.preview(ref)) as McpPreview;
   console.log(page.name, page.auth, page.tools?.map((t) => t.name));
   ```

   For a server that takes a key, name its header in the ref, such as `{ url, headers: ["Authorization"] }`.

2. Add it with that hash. If the server changed since the preview, `add` fails with status 409: look at it again.

   ```ts
   const server = await fxbot.plugins.add(ref, page.hash);
   ```

3. Give it what it needs to connect. For a key, set the header's value:

   ```ts
   await fxbot.plugins.setSecrets(server.id, { headers: { Authorization: `Bearer ${key}` } });
   ```

   Values go in once and are sealed. A listed server says only `signedIn: true`. For OAuth, see [Sign in with OAuth](#sign-in-with-oauth).

4. Allow the tools bots may call. At first, only the server's read-only tools are allowed. Name every tool to allow, by the server's own name for it:

   ```ts
   await fxbot.plugins.change(server.id, { allowed: ["search_issues", "create_issue"] });
   ```

   `plugins.list()` shows each server's `tools`, each with `readOnly`, its `allowed` list, and its `status`, such as `Connected`. A server that signs in lists its tools once it connects.

5. To give the server to some bots only, choose them one by one:

   ```ts
   await fxbot.plugins.change(server.id, { bots: "each" });
   await fxbot.plugins.forBot(bot.id, server.id, true);
   ```

Bots see each tool under the server's name, such as `linear_create_issue`.

## Add a server from a registry

Search fxbot's list of servers and its copy of GitHub's MCP registry, then add an entry by its name:

```ts
import type { McpSearch } from "@fxbot/sdk";

const { cards } = (await fxbot.plugins.search("linear", {})) as McpSearch;
const ref = { registry: cards[0].name, from: cards[0].from };
const page = (await fxbot.plugins.preview(ref)) as McpPreview;
const server = await fxbot.plugins.add(ref, page.hash);
```

Then carry on from step 3 above. A card's `from` is `fxbot` for fxbot's list, `github` for GitHub's registry, or `official`. `{ everything: true }` adds the official registry's results, for searches of 3 characters or more.

The copy of GitHub's registry fills in when `createFxbot` starts and every hour after. An app started with `syncRegistry: false` has nothing to search until a sync has run. It can still add an entry by its name: `{ registry: "<name>" }`.

## Sign in with OAuth

For a server whose `auth` is `oauth`.

1. Start the sign-in, and send the person to its `url`:

   ```ts
   const attempt = await fxbot.oauth.start(server.id, origin);
   console.log(`Open ${attempt.url}`);
   ```

2. Finish it the way its `mode` says:

   - `redirect`: the browser comes back to `<origin>/api/oauth/callback`. `origin` is your page's own, and must be HTTPS. Route that path in your server to `fxbot.oauth.callback(url.searchParams)`.
   - `paste`: the browser goes to the `localUrl` you gave `createFxbot`, `http://127.0.0.1:8787` by default, at `/callback`. Serve that path with `fxbot.oauth.callback` too. Where nothing serves it, the page fails to load: pass its address, copied from the browser, to `fxbot.oauth.paste(attempt.id, address)`.

3. Ask `fxbot.oauth.get(attempt.id)` until its `status` is `done` or `failed`. A sign-in expires after 10 minutes.

A server that registers no apps itself needs your own OAuth app: register one with it, then pass it with `setSecrets(server.id, { clientId, clientSecret })`.

## Add a skill

1. Find it in fxbot's own skills, or on skills.sh for 2 characters or more:

   ```ts
   import type { SkillPreview, SkillSearch } from "@fxbot/sdk";

   const { cards } = (await fxbot.plugins.search("frontend", { kind: "skill" })) as SkillSearch;
   const ref = { skill: cards[0].id }; // <owner>/<repo>/<skillId>
   ```

2. Look at it. `preview` reads the skill from its repository's current commit:

   ```ts
   const page = (await fxbot.plugins.preview(ref)) as SkillPreview;
   if (page.error) throw new Error(page.error);
   console.log(page.text); // its SKILL.md
   ```

3. Add it with the hash:

   ```ts
   const skill = await fxbot.plugins.add(ref, page.hash);
   ```

Each bot's instructions now list its skills, and the `skill` tool reads one when a task needs it. To be sure a bot uses a skill, name it in a message: `$name` anywhere, or `/name` at the start, sends the skill along with it:

```ts
await fxbot.send(bot.id, { text: "/frontend-design A page for a bakery", messageId: crypto.randomUUID() });
```

`profiles.skills(bot.id)` lists the names a bot takes. Skills go to all bots, or to chosen ones with `change` and `forBot`, as servers do.

## Keep plugins up to date

`plugins.list()` marks a plugin whose source changed. Its `mark.kind` is `update`, with the newer `version`, or `deprecated`, or `removed`. Nothing changes by itself. To move one to its newer version, look at it again from the same source, then update it with that hash:

```ts
for (const addon of await fxbot.plugins.list()) {
  if (addon.mark?.kind !== "update") continue;
  const ref = addon.kind === "skill" ? { skill: addon.source.skill } : { registry: addon.source!.registry, from: addon.source!.from, allowLocal: addon.allowLocal };
  const page = await fxbot.plugins.preview(ref);
  await fxbot.plugins.update(addon.id, page.hash);
}
```

The skills' repositories are checked every hour. `plugins.check()` checks them now.

`change(id, { enabled: false })` turns a plugin off, and `remove(id)` removes it. A change to the tools bots have makes the agents again, after their running turns finish.

## If it doesn't work

- **`add` or `update` fails with status 409.** The server or skill changed since its preview. Look at it again, and use the new hash.
- **`preview` says the address is local.** A server on this machine or a private network needs `allowLocal: true` in the ref. It may then use `http`. Use it only for a server you run.
- **The server's `status` is `Add its header values`.** Set them with `setSecrets`. Header names must be the ones the ref named.
- **The server's `status` is `Sign in to use it`.** Run the OAuth sign-in above.
- **A tool call fails, saying the tool is not allowed.** Add it to `allowed` with `change`.
- **The preview has `local: true`, and `add` refuses it.** That entry runs as a program on this machine, not as a remote server, and the SDK can't add it yet.
- **The MCP search finds nothing.** The registry's copy hasn't synced: see [Add a server from a registry](#add-a-server-from-a-registry).

fxbot's own page does the same in Plugins: [Add an MCP server](/docs/how-to/add-an-mcp-server/) and [Add a skill](/docs/how-to/add-a-skill/).
