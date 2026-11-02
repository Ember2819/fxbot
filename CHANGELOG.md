# Changelog

Each release of fxbot, newest first. A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**. Lines for the next release collect under Unreleased, and the release workflow publishes a version's section as its notes.

## Unreleased

**Before upgrading.** Migration `0002_model_lists` adds a table that keeps each provider's model list, and `0003_registry_entries` adds two that keep a copy of GitHub's MCP registry. Chats and add-ons carry on.

- The Add-ons page is a search above four tabs: Installed, Skills, MCP, and Plugins. MCP searches GitHub's MCP registry, which fxbot mirrors every hour, and **Search everything** adds the official registry's unmoderated results. Each entry opens on a page that shows its host (in red when it isn't on the publisher's domain), how it signs in, the keys it needs, and where it comes from, before **Add**. Adding by address is still there, under MCP. Skills and Plugins say they aren't in fxbot yet.
- fxbot ships with its own list of MCP servers, starting with alphaXiv and Keiro, tagged **fxbot** and listed first. With `FXBOT_MCP_FXBOT` set to its published copy (the website's `mcp-registry.json`), fxbot reads it every hour, so the list can grow between releases. Other cards are tagged **GitHub registry** or **Official registry**, and a server on more than one shows once, as fxbot's.
- An installed server from a registry is marked **Update available**, **Deprecated**, or **Removed from the registry**, and nothing changes by itself. **Update to** shows what the newer version changes, and moves only on **Update**.
- Past 40 tools reaching the bots, the Add-ons page says how many.
- A server still connecting when fxbot stops no longer writes to the database after it closes.

- Model lists outlast restarts. fxbot keeps each provider's list in Postgres and answers with it at once, fetching a fresh one behind the answer when it is over 5 minutes old; a failed refresh keeps the old list ([#5](https://github.com/iammrduncan/fxbot/issues/5)).
- The chat shows how each reply came about, in order: thinking, tool calls, and text between them. A tool call reads as a sentence, such as "Searched the library" or "Ran linear_create_issue", and opens on its input and result; a failed one says so in red. Two or more steps in a row fold under one line, such as "Thought and used 2 tools", open while the bot works. Before, tool calls didn't show at all, and the thinking showed as one block.
- The model field is a picker that opens on the provider's whole list, the current model marked, and narrows as you type. Before, the browser's suggestions showed only the model already chosen. A model id the list lacks can still be typed in, and Clear empties the field.
- `setup.sh` stops, and says why, when another fxbot already holds its names: a database `fxbot`, a key in `/etc/fxbot`, or port 8787.
- A checkout's `npm run dev` runs its API on port 8788, so it runs beside a release install on one machine.
- The README shows how to serve fxbot at its own tailnet name, such as `bot.<tailnet>.ts.net`, as a Tailscale Service.

## 0.1.0 (2026-11-02)

The first release.

- **Bots and chats.** Bots drawn as animated blobs, each with a streaming chat that survives reloads and restarts, image and text attachments, and a `chat_history` tool that searches its own past.
- **Providers.** ChatGPT, Grok, and Vercel accounts by device code, API keys, and local model servers, with every key and token sealed in Postgres.
- **The library.** Every file the chats hold, searchable, for people and bots.
- **An installable app** for phones and desktops.
- **MCP servers.** Tools from any remote MCP server, signed in with OAuth or a key, for all bots or chosen ones, with only the tools you allow.
- **Releases.** `setup.sh` installs a release, and Settings or `npm run update` moves to the next one. The database migrates forward, with a backup first.
