# Changelog

Each release of fxbot, newest first. A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**. Lines for the next release collect under Unreleased, and the release workflow publishes a version's section as its notes.

## Unreleased

**Before upgrading.** Migration `0002_model_lists` adds a table that keeps each provider's model list. Chats carry on.

- Model lists outlast restarts. fxbot keeps each provider's list in Postgres and answers with it at once, fetching a fresh one behind the answer when it is over 5 minutes old; a failed refresh keeps the old list ([#5](https://github.com/iammrduncan/fxbot/issues/5)).
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
