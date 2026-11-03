# Changelog

Each release of fxbot, newest first. A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**. Lines for the next release collect under Unreleased, and the release workflow publishes a version's section as its notes.

## Unreleased

**Before upgrading.** Migration `0006_plugins` adds a `plugin` column to `sent` and a `plugin_sessions` table, for plugins.

- **Plugins.** Add-ons that change fxbot itself. A plugin runs inside fxbot: it can hook into each message, each chat's instructions, every tool call, and each turn's start and end, and add tools, routes, tables of its own, settings, and places in the app, from a screen and a sidebar group to a control beside the message box. Add one from the new Plugins tab in Add-ons, from fxbot's list or any GitHub repository: its page shows the code that runs before you add it, and it stays pinned to that commit until you update it. For writing one in a checkout, `FXBOT_PLUGIN_DIRS` loads plugin folders, again each time they change.
- **Chat rooms**, fxbot's first plugin: rooms where several of your bots talk with you, each answering every message once, in turn.
- **herdr**, its second: bots see the coding agents [herdr](https://herdr.dev) runs, and read what their panes show.
- The site's SDK pages have [Write a plugin](https://fxbot.sh/sdk/how-to/write-a-plugin/) and the [Plugin API](https://fxbot.sh/sdk/reference/plugin-api/), and its docs [Add a plugin](https://fxbot.sh/docs/how-to/add-a-plugin/).
- The SDK's `close()` waits for the save of a reply that just finished, so a script can close right after a turn. A reply that can't be saved, such as one whose bot was just deleted, is logged instead of stopping the process.

## 0.3.0 (2026-11-02)

**Before upgrading.** fxbot now runs as containers, and Settings' Update in 0.1 or 0.2 can't make that move. Run `setup.sh` again instead, the command under Install: it stops the old service, copies its database into the database container, and starts the containers on the same chats, key, and settings. The old files and database stay until you remove them, and `sudo fxbot status` says how, or how to go back. Migration `0005_memories` adds memories and vectors, and needs pgvector, which the database container has: on the machine's own Postgres, it stops and says to run `setup.sh`. The local embedder downloads its 310 MB model on its first start, holds about 380 MB, and fills in vectors for existing messages in the background. A checkout moves its database too: see the README's Run from a checkout.

- **Containers.** `setup.sh` installs fxbot as containers, with podman, or docker when only docker is installed: fxbot's image from ghcr.io, for amd64 and arm64, pgvector's Postgres image, and the local embedder. It no longer installs Node or the distro's Postgres. `sudo fxbot` runs them: `status`, `logs`, `update`, `up`, `down`, `restore`, `rotate-key`, and `embedder`.
- **Updates through the machine.** Settings' Update asks the machine, which starts the new release and waits until it answers. If it doesn't, the old release comes back by itself, on the backup taken before the new one's migrations, and Settings shows why. The database keeps running, and running chats finish first.
- **Memories.** Each bot keeps what it learns: it saves one fact at a time with `memory_save`, finds them with `memory_search`, and removes wrong ones with `memory_forget`, which the chat shows as sentences. The newest are in its instructions on every turn, within 2% of the model's context window, and the owner sees, adds, edits, and deletes them in the bot panel's Memories tab.
- **Memory search by meaning.** Memory search and `chat_history` match by meaning as well as by words. The vectors come from a local embedder (EmbeddingGemma 2 on the CPU, or Qwen3-Embedding on an NVIDIA GPU), from a provider's embedding model, or from none, picked in Settings' Memory search, or with `sudo fxbot embedder`. Chat messages get vectors too, from their first 8,000 characters, which Settings can change or turn off.
- `sudo fxbot rotate-key` seals every stored key and token again under a new key, and keeps the old key until you remove it.
- A checkout's database and local embedder run from `deploy/compose.dev.yaml`. `npm run update` is gone: a checkout updates with git.
- The server listens on `FXBOT_HOST`, 127.0.0.1 by default.
- fxbot reads its own lists of MCP servers and skills from its site, https://fxbot.sh, every hour, so new picks show up between releases. Before, it read them only with `FXBOT_LISTS_URL` set, which now points it at another site.
- The website's top bar and the README link to the Hackers in the Loop community on [Discord](https://discord.gg/3Qs2uejUf9).

## 0.2.1 (2026-11-02)

A website release. The app is the same as 0.2.0.

- A link to fxbot.sh shares as a preview card, with the bots, the heading, and the site's address.
- Each page of the site names its canonical address and has Open Graph and Twitter tags. The site has a sitemap and a `robots.txt`, and its link check covers them.

## 0.2.0 (2026-11-02)

**Before upgrading.** Migration `0002_model_lists` adds a table that keeps each provider's model list, `0003_registry_entries` adds two that keep a copy of GitHub's MCP registry, and `0004_skills` adds one for skills. Chats and add-ons carry on.

- **Skills.** Bots use [Agent Skills](https://agentskills.io): instructions for a kind of task, read only when a task needs them. The Add-ons page's Skills tab lists fxbot's own picks (show-me, frontend-design, and grilling), tagged **fxbot**, and searches skills.sh, tagged **skills.sh**. A skill installs as skills.sh installs it, from its GitHub repository at the commit its page showed. Each bot's instructions list its skills, within 1% of the model's context window, and a `skill` tool reads one, which the chat shows as "Read a skill". In a chat, `$`, or `/` at the start, lists the bot's skills: the one picked goes with the message as a chip, so the bot has it without deciding to. Skills go to all bots or chosen ones, like MCP servers, and are marked **Update available** when their files change upstream. Nothing in a skill runs.

- The Add-ons page is a search above four tabs: Installed, Skills, MCP, and Plugins. MCP searches GitHub's MCP registry, which fxbot mirrors every hour, and **Search everything** adds the official registry's unmoderated results. Each entry opens on a page that shows its host (in red when it isn't on the publisher's domain), how it signs in, the keys it needs, and where it comes from, before **Add**. Adding by address is still there, under MCP. Plugins says they aren't in fxbot yet.
- fxbot ships with its own list of MCP servers, starting with alphaXiv and Keiro, tagged **fxbot** and listed first. With `FXBOT_LISTS_URL` set to the site that publishes it (the website's `mcp-registry.json`, beside `skills-registry.json`), fxbot reads it every hour, so the lists can grow between releases. Other cards are tagged **GitHub registry** or **Official registry**, and a server on more than one shows once, as fxbot's.
- An installed server from a registry is marked **Update available**, **Deprecated**, or **Removed from the registry**, and nothing changes by itself. **Update to** shows what the newer version changes, and moves only on **Update**.
- Past 40 tools reaching the bots, the Add-ons page says how many.
- A server still connecting when fxbot stops no longer writes to the database after it closes.

- Model lists outlast restarts. fxbot keeps each provider's list in Postgres and answers with it at once, fetching a fresh one behind the answer when it is over 5 minutes old; a failed refresh keeps the old list ([#5](https://github.com/iammrduncan/fxbot/issues/5)).
- The chat shows how each reply came about, in order: thinking, tool calls, and text between them. A tool call reads as a sentence, such as "Searched the library" or "Ran linear_create_issue", and opens on its input and result; a failed one says so in red. Two or more steps in a row fold under one line, such as "Thought and used 2 tools", open while the bot works. Before, tool calls didn't show at all, and the thinking showed as one block.
- The model field is a picker that opens on the provider's whole list, the current model marked, and narrows as you type. Before, the browser's suggestions showed only the model already chosen. A model id the list lacks can still be typed in, and Clear empties the field.
- `setup.sh` stops, and says why, when another fxbot already holds its names: a database `fxbot`, a key in `/etc/fxbot`, or port 8787.
- A checkout's `npm run dev` runs its API on port 8788, so it runs beside a release install on one machine.
- The README shows how to serve fxbot at its own tailnet name, such as `bot.<tailnet>.ts.net`, as a Tailscale Service.
- fxbot has a website with its docs, in `packages/website`. `npm run build-site` builds it into `out/` and checks its links.

## 0.1.0 (2026-11-02)

The first release.

- **Bots and chats.** Bots drawn as animated blobs, each with a streaming chat that survives reloads and restarts, image and text attachments, and a `chat_history` tool that searches its own past.
- **Providers.** ChatGPT, Grok, and Vercel accounts by device code, API keys, and local model servers, with every key and token sealed in Postgres.
- **The library.** Every file the chats hold, searchable, for people and bots.
- **An installable app** for phones and desktops.
- **MCP servers.** Tools from any remote MCP server, signed in with OAuth or a key, for all bots or chosen ones, with only the tools you allow.
- **Releases.** `setup.sh` installs a release, and Settings or `npm run update` moves to the next one. The database migrates forward, with a backup first.
