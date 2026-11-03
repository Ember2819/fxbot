# @fxbot/sdk

The agent system behind fxbot, for building another server or UI on it. It has two entries. [fxbot's site](https://fxbot.sh/sdk/) has a tutorial, how-to guides, and a reference for building your own app on it.

`@fxbot/sdk` runs on the server. It keeps fxbot's records in Postgres: providers, bot profiles, settings, the library of files, and every message, with keys and tokens only sealed. It runs one [libfx](https://fx.sh/docs/lib) agent per provider, and a durable chat with each bot. Call it from your backend, which holds the key that seals the secrets.

```ts
import { createFxbot } from "@fxbot/sdk";

const fxbot = await createFxbot({ databaseUrl: "postgres:///fxbot", secretKey: readFileSync(keyFile, "utf8") });
const local = await fxbot.providers.add({ kind: "ollama", model: "qwen3:8b" });
const bot = await fxbot.profiles.create({ name: "Scout", provider: local.id });
await fxbot.send(bot.id, { text: "Hello", messageId: "m1" }); // resolves once libfx stores the prompt
const lines = await fxbot.stream(bot.id); // NDJSON from the first line, then each new one
```

- `providers` adds key and server providers, after checking the key, and lists, updates, and removes them. A listed provider says whether it holds a key or a sign-in, never what it is. `providers.models(id)` lists a provider's models and what fxbot knows of each.
- `signIns.start({ kind })` begins a device code sign-in for a ChatGPT, Grok, or Vercel account. It returns only the code, the link, and the expiry; `signIns.get(id)` reports `waiting`, `done`, or `failed`.
- `profiles` and `settings` work as before. A bot also has a `provider`, and moving a bot with a chat to another provider summarizes the chat into the new one; `profiles.earlier(id)` returns the chats before the current one, for showing above the summary. Its look is a `shape` from `shapes` and a `color` from `colors`, and `busy` says whether a turn runs. `pinned` puts a bot at the top of the list: the first bot starts pinned, and at most `maxPinned` (3) are.
- `library` holds one copy of each file the chats hold, by the SHA-256 of its bytes: images and text files sent with a message, and documents bots save. Each item is tagged with every bot and chat that saved it, and outlives a deleted bot. `library.list({ q, profileId, kind, before, limit })` pages through items newest saved first, searching names and document text; `get(id)`, `file(id)` (the bytes, or none for a matching ETag), and `remove(id)` work on one.
- `addons` are remote MCP servers. `addons.preview({ url })` probes a server and returns its page: name, how it signs in (`none`, `headers`, or `oauth`), its tools when it lists them without a sign-in, and a `hash`. `addons.add(ref, hash)` adds it only if it still matches that hash; `{ registry, version }` adds a registry entry instead, from GitHub's registry unless `from` is `fxbot` (fxbot's own list, `src/mcp-registry.json`) or `official`. `addons.search(q, { kind, everything })` searches fxbot's list and the hourly mirror of GitHub's registry, one card per server, fxbot's first, ranked by the server's name, then title, then namespace, then description; `everything` adds the official registry's results. Each card's `from` says where it came from. `list()` gives a registry add-on its entry's `info` and a `mark` (`update`, `deprecated`, or `removed`), and `update(id, hash)` moves it to the newer version whose page had that hash. `setSecrets(id, { headers, clientId, clientSecret })` is write-only. `change(id, { enabled, bots, allowed })` turns a server off, gives it to `all` bots or to `each` chosen bot, and names the tools bots get (the read-only ones until set); `forBot(profileId, id, enabled)` chooses a bot. Every server's allowed tools go to every agent, prefixed with the server's name, and refuse inside a bot not chosen. Addresses must be HTTPS and public unless the add-on allows local ones.
- Skills are add-ons too, named as skills.sh names them: `addons.preview({ skill: "<owner>/<repo>/<skillId>" })` reads the repository's current commit from GitHub and returns the skill's page (its SKILL.md, its files, and a `hash`), and `add` takes that hash. `addons.search(q, { kind: "skill" })` lists fxbot's own skills (`src/skills-registry.json`), then skills.sh's results. `readSkill(id, file?)` reads an installed skill's file, and `check()` runs the hourly check of the skills' repositories now. In `send(id, message)`, a `$name` in the text, or `/name` at its start, sends that skill along with the message as a `skill://` resource, and `profiles.skills(id)` lists the names a bot takes. A skill is kept as libfx's `SkillRecord`. Each bot's session instructions list its skills, and the `skill` tool reads one, answering with libfx's own rendering.
- `oauth.start(id, origin)` begins an OAuth sign-in to a server and returns its URL and mode. `origin` is the page's, which the server has checked: `redirect` comes back to an HTTPS origin's `/api/oauth/callback`, and otherwise `paste` takes the address of a loopback page that could not load, through `oauth.paste(attemptId, address)`. `oauth.get(attemptId)` reports `waiting`, `done`, or `failed`, and `oauth.callback(query)` finishes a redirect. Pass `localUrl`, `clientMetadataUrl`, `registryUrl`, `everythingUrl`, and `listsUrl` to `createFxbot` to set the loopback callback, the registry it mirrors, the one Search everything asks, and the site that publishes fxbot's own lists (default `https://fxbot.sh`); `syncRegistry: false` stops the syncs.
- `release()` returns the running `version` (an option of `createFxbot`, from the root `package.json`) and `latest`, the newest stable release when it is newer. `releasesUrl` names where that is read, in the shape of GitHub's `releases/latest`, once at start and then daily; without it nothing is asked. `compareVersions`, `isVersion`, `isStable`, and `releasesUrlFor(repository)` are exported for the server's updates.
- `close()` lets go of the agents, the MCP connections, and Postgres.
- `rotateSecrets({ databaseUrl, from, to })` seals every stored secret again under a new key, add-ons' included.

Bad input throws an Error with `status` 400, and a missing bot one with 404. `createFxbot` first brings the database up to date: the numbered SQL files in `src/migrations/` that it hasn't run, in one transaction, under a lock, after backing up the database and `dataDir` into `backupsDir` (default `backups`). It refuses a database that a newer release migrated. Turns that a stopped process left open run again when `createFxbot` is called. Every bot gets a `chat_history` tool that searches its own messages across all its chats and reads them in full around a match, and `library_search`, `library_read`, and `library_save`, which reach only the items tagged for that bot.

`@fxbot/sdk/client` runs in a page or a script and talks to an fxbot server over HTTP. It carries no credentials: a key goes to the server once and never comes back.

```ts
import { applyLine, createClient, type Turn } from "@fxbot/sdk/client";

const client = createClient(); // the page's origin, or { baseUrl }, and onVersion to hear the server's version
let turns: Turn[] = [];
for await (const line of client.stream(botId, { signal })) turns = applyLine(turns, line);
```

`client.stream` reconnects from the last cursor after a dropped connection. `applyLine` folds the lines into one entry per message: its files, any error, and `parts`, the reply step by step in the order it happened (thinking, text, and tool calls with their input and result), plus `reply`, its text alone. The client also has `providers`, `signIns`, `library` (list, get, remove; a file is read through its item's `url`), `addons` and `oauth` (header values and OAuth clients go up once and never come back), `update` (the version, the newest release, and starting an update where the server can), and the `kinds` and `itemKinds` tables.

The package ships TypeScript source and runs on Node 22.18 or newer without a build. It is private to this workspace. Publishing it would need a build step.
