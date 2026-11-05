# fxbot

Join the Hackers in the Loop community on [Discord](https://discord.gg/3Qs2uejUf9) to talk about fxbot, share what you build with it, and get help.

fxbot is your bot, built and configured how you want it. It starts simple, with a lean, fast core: bots, their chats, and their files. Make each bot yours, from its look and instructions to its model and tools. Grow fxbot with only the plugins you want: skills, MCP servers, and plugins that change the app itself.

fxbot is local first. One Node server and Postgres run on your own machine, and the browser is the UI on desktop and mobile. [libfx](https://fx.sh/docs/lib) sends each chat to the provider its bot uses: a local model server such as Ollama or LM Studio, an API key, or a ChatGPT, Grok, or Vercel account signed in with a device code.

![fxbot in a desktop browser: Bob's chat open, with Fernando and Securely in the sidebar](docs/screenshot.png)

Simplicity is the rule: a small core, few dependencies, and no abstraction until a second real use. The core is what every bot needs, and everything else is a plugin. See [Core or plugin](CONVENTIONS.md#core-or-plugin).

## Stack

A TypeScript monorepo with four npm workspaces under `packages/`, laid out after [eve](https://eve.dev): a core package with a client subpath, a thin server, a UI on the client, and the public site.

| Package | What it is |
| --- | --- |
| [`@fxbot/sdk`](packages/sdk/README.md) | The agent system: providers and their sign-ins, one libfx agent per provider, bot profiles, settings, uploads, each bot's durable chat, and its searchable history. `@fxbot/sdk/client` is a typed client for the server's HTTP API, with the stream reader and the turn reducer a UI needs. To build your own app on it, see [the SDK's pages](https://fxbot.sh/sdk/). |
| `@fxbot/server` | The backend: `node:http` routes over the SDK, and the built UI. Keys and tokens stay here, sealed in Postgres. |
| `@fxbot/ui` | The PWA: Vite, React, and shadcn/ui, with the chat built from shadcn's AI Elements patterns, on `@fxbot/sdk/client`. |
| `@fxbot/website` | The public site and its docs, static pages in `out/` built by `npm run build-site`: the home page in React and Tailwind, and the docs in Astro's [Starlight](https://starlight.astro.build), with search. `FXBOT_SITE_BASE` sets the path it is served under. |

Records live in Postgres, and so do libfx's sessions, each chat's. No Next.js, and no Vercel AI SDK. The packages run as TypeScript source on Node 22.18 or newer, with no build step but the UI's and the site's.

## Phases

In order of execution priority. Checked phases are built. Each is marked **core** or **plugin** ([Core or plugin](CONVENTIONS.md#core-or-plugin)). A core seam is a part of the core that plugins plug into. Memories and Plugins have full plans, and the rest are one-page stubs until they are planned.

- [x] [v1](docs/_completed/v1-plan.md) (core): bot profiles and a streaming chat
- [x] [Provider logins](docs/_completed/phases/provider-logins.md) (core): ChatGPT, Grok, and Vercel accounts, API keys, and local model servers
- [x] [Library](docs/_completed/phases/library.md) (core): every file the chats hold, for people and bots
- [x] [PWA](docs/_completed/phases/pwa.md) (core): installs on phones and desktops
- [x] [MCP servers](docs/_completed/phases/mcp.md) (core seam): tools from any remote MCP server, with OAuth sign-in
- [x] [Releases](docs/_completed/phases/releases.md) (core): install a release, and update when the next one is ready
- [x] [Plugin search](docs/_completed/phases/addons.md) (core seam): search GitHub's MCP registry, add a server from its page, and update installed ones
- [x] [Skills](docs/_completed/phases/skills.md) (core seam): instructions bots read when a task needs them, from fxbot's list and skills.sh
- [x] [Containers](docs/_completed/phases/containers.md) (core): podman or docker, one compose file for fxbot and its database with pgvector, and updates through the machine's `fxbot` command
- [x] [Memories](docs/_completed/phases/memories.md) (core): each bot keeps what it has learned, and search by meaning from a local or remote embedder
- [x] [Plugins](docs/_completed/phases/plugins.md) (core: the plugin API): plugins that change the app, with hooks, tools, data, and screens of their own; fxbot's first two were chat rooms and herdr: [chat rooms](plugins/chat-rooms/README.md) is in `plugins/`, and herdr left in 0.4.1, to be planned again
- [x] [One kind of plugin](docs/_completed/phases/one-kind-of-plugin.md) (core seam): one name and one list. A plugin carries any mix of code, MCP servers, and skills, and only the ones fxbot vets show until a switch in Settings
- [x] [Agent computer](docs/_completed/phases/computer.md) (plugin, one others build on): a Linux computer for each bot, in the machine's own podman or docker, run rootless; the [computer](plugins/computer/README.md) is in `plugins/`
- [x] [Streams](docs/_completed/phases/streams.md) (core): chats in the Postgres fxbot already runs, so an open chat costs nothing while idle and a long one is as quick to send to as a new one
- [x] [Computer v2](docs/_completed/phases/computer-v2.md) (plugin, with one core hook): a whole computer in one plugin: a desktop the owner watches and takes over, a shared terminal, a browser on the desktop, and the tools to drive them by pixels, accessibility trees, and text
- [ ] [Permissions](docs/phases/permissions.md) (plugin, on a core hook): ask, auto, and yolo modes for tool calls
- [x] [Chat rooms](docs/_completed/phases/chat-rooms.md) (plugin, with two core hooks; 0.4.1): rooms of the owner and several bots, with `@` chips, bots tagging each other within limits, a Stop, and skills for working in a room
- [ ] [Cross-bot messaging](docs/phases/cross-bot-messaging.md) (plugin): bots message each other
- [ ] [Routines](docs/phases/routines.md) (plugin): saved tasks a bot runs on a schedule
- [ ] [Triggers](docs/phases/triggers.md) (plugins): webhooks and new email start a bot's turn
- [ ] [Soul](docs/phases/soul.md) (plugin): a written persona behind each bot's system prompt
- [ ] [Context management](docs/phases/context-management.md) (core): one never-ending chat that fits the model's context window, past the compaction libfx does
- [ ] [Past sessions](docs/phases/past-sessions.md) (core): earlier conversations stay browsable
- [ ] [Knowledge base](docs/phases/knowledge-base.md) (plugin): knowledge the bots draw on
- [ ] [Pages](docs/phases/pages.md) (plugin): reports and guides bots write for reading outside the chat
- [ ] [herdr screen](docs/phases/herdr-screen.md) (plugin): the [herdr](https://herdr.dev) interface in the app, from a herdr plugin
- [ ] [Remote control](docs/phases/remote-control.md) (plugin): heavy work handed to coding agents through herdr
- [ ] [Web search](docs/phases/web-search.md) (plugin): bots search and read the web, and cite it
- [ ] [Vault](docs/phases/vault.md) (plugin): saved secrets and details bots use when allowed
- [ ] [1Password](docs/phases/1password.md) (plugin): bots use stored logins and items from 1Password
- [ ] [Image and video generation](docs/phases/media-generation.md) (plugin): bots create images and video
- [ ] [Voice memos](docs/phases/voice-memos.md) (plugin): send a bot a recorded voice memo
- [ ] [Phone calls](docs/phases/phone-calls.md) (plugin): talk with a bot by voice, in the app or over a phone line

The previous design and spike are in [archive/](archive/README.md). The git host may still use the old repository name until the owner renames it.

## Install

On Debian or Ubuntu, `setup.sh` installs the newest release, or the one you name:

```sh
curl -fsSL https://fxbot.sh/setup.sh | sudo bash
curl -fsSL https://fxbot.sh/setup.sh | sudo bash -s -- v0.3.0
```

fxbot runs as containers: the app, its database in pgvector's Postgres image, and the local embedder for memory search, from one compose file. `setup.sh` reads the versions the machine has and sets up what's missing: podman 4 or newer, or docker, and Compose 2.26 or newer, from the distro or from Compose's own release. Then:
- the `fxbot` user, and a key in `/etc/fxbot/secret.key` that only `fxbot` reads
- `/opt/fxbot`: the release's `compose.yaml`, an `.env` with its version and a random database password, and the `fxbot` command, also at `/usr/local/bin/fxbot`
- `/etc/fxbot/fxbot.env` for the app's settings, with plugins' files in `/var/lib/fxbot/data`, backups in `/var/lib/fxbot/backups`, and the app's update requests in `/var/lib/fxbot/control`
- `fxbot.service`, which starts the containers at boot, on 127.0.0.1:8787, and `fxbot-control.path`, which hands Settings' updates to the `fxbot` command

Running it again finishes an install that stopped, and leaves a working one alone. It stops, and says why, if another program holds port 8787. A checkout's `npm run dev` stays clear of it ([Run from a checkout](#run-from-a-checkout)), so both can run on one machine.

| Command | What it does |
| --- | --- |
| `sudo fxbot status` | The version and the containers |
| `sudo fxbot logs [fxbot \| db]` | Their logs |
| `sudo fxbot update [version]` | Moves to the newest release, or the one named. See [Update](#update) |
| `sudo fxbot up` and `down` | Starts and stops the containers, as `fxbot.service` does |
| `sudo fxbot restore <folder>` | Puts a backup in place of the database, and unpacks its data folder |
| `sudo fxbot rotate-key` | Seals every stored key and token again under a new key, and keeps the old key as `secret.key.old` |
| `sudo fxbot embedder cpu\|gpu\|off` | Runs memory search's local embedder on the CPU, on a GPU after a trial run reaches one, or not at all |
| `sudo fxbot computer on\|off` | Sets up the computer plugin's engine, as adding the plugin does, or takes it away with its computers |

**Moving from 0.2.** An install of 0.2 ran on the machine's own Postgres. Run `setup.sh` again: it stops 0.2, copies its database into the database container, and starts the containers on the same chats, key, and settings. The 0.2 files, settings, and database stay until you remove them, and `sudo fxbot status` says how to remove them or go back to 0.2. Settings' Update in 0.2 can't make this move.

### Reaching it

fxbot listens on 127.0.0.1:8787 and has no login of its own. On the machine itself, open `http://127.0.0.1:8787`: everything works there, installing the app included.

From your other devices, [Tailscale](https://tailscale.com) is the recommended way. It adds HTTPS, which a phone needs to install the app, and only your own devices can reach fxbot. Give it the machine's own address:

```sh
sudo tailscale serve --bg 8787       # https://<machine>.<tailnet>.ts.net
```

Or a name of its own, `bot.<tailnet>.ts.net`, as a [Tailscale Service](https://tailscale.com/kb/1552/tailscale-services). The machine must be tagged, and a tailnet admin does three things once:
1. **Define the service** on the admin console's Services page: **Define a Service**, named `bot`, with the port `tcp:443`.
2. **Approve this machine** as its host on that service's page, or with an `autoApprovers` rule for the machine's tag.
3. **Grant access** in the policy file, such as `{ "src": ["autogroup:member"], "dst": ["svc:bot"], "ip": ["443"] }`.

Then, on the machine:

```sh
sudo tailscale serve --service=svc:bot --https=443 http://127.0.0.1:8787
```

Check the address from a phone or laptop on the tailnet, not from the machine itself: a grant to people doesn't cover a tagged machine, so the name may not resolve there.

Anything else in front of fxbot, such as a reverse proxy or another VPN, works if it:
- **adds its own login or access control.** Whoever reaches fxbot can use all of it: every bot, chat, and provider.
- **serves HTTPS,** which installing the app needs, and which lets an MCP server's sign-in come back to fxbot by itself.
- **passes the `Host` header through unchanged.** fxbot refuses a write whose page origin doesn't match the host it was reached at.
- **doesn't buffer responses,** since each chat streams its replies.

Never open port 8787 to a network directly.

Open the address on each device and install the app from it: Install in Settings on Chrome or Edge, or Share and then Add to Home Screen on an iPhone. The app opens offline, and offers Reload when an update lands.

## Update

When a newer release is out, Settings shows its notes and an **Update** button. The app asks the machine, and the `fxbot` command there downloads the release, starts it, and waits until it answers. Running chats get 30 seconds to finish first, and one still running goes on in the new release. The database keeps running. From a shell:

```sh
sudo fxbot update            # the newest release, or name one: sudo fxbot update 0.3.1
```

- **Migrations.** Each release's database changes are numbered files in `packages/sdk/src/migrations/`. A starting server runs the ones the database hasn't, all or none. It first backs up the database and `FXBOT_DATA` into `FXBOT_BACKUPS`, and keeps the last five. The tables that hold the chats are Workflow's Postgres World's, in schemas of their own, and its own setup migrates them, after the same backup.
- **A release that doesn't start** is replaced by the one before, on the backup taken before its migrations if it ran any. Settings shows why.
- **Prereleases,** such as `0.3.0-rc.1`, install only by name.
- **Going back.** After a migration, the older release refuses the database. Restore the backup taken before it, then name the older version:

  ```sh
  sudo fxbot restore /var/lib/fxbot/backups/<date>-before-<migration>
  sudo sed -i 's/^FXBOT_VERSION=.*/FXBOT_VERSION=0.3.0/' /opt/fxbot/.env && sudo fxbot up
  ```

  With no migration in between, only the second line.

## Run from a checkout

Node 22.18 or newer, and podman or docker for the database. From the repository root:

```sh
npm install
npm run dev      # the page on 127.0.0.1:5173 and the API on 8788, reloading on any change
npm run prod     # build the page, then serve it and the API on 127.0.0.1, port FXBOT_PORT
npm run server   # only the API and the last build, on the same port
```

The server reads these from the environment, or from an uncommitted `.env` in the repository root; the environment wins. Only the server and the checkout's compose file read `.env`. `FXBOT_DATABASE_URL` holds the database's password, and the key that seals everything else stays in its own file.

| Variable | What it is |
| --- | --- |
| `FXBOT_DATABASE_URL` | Required. fxbot's Postgres, such as `postgres://fxbot:<password>@127.0.0.1:5433/fxbot_dev` from `deploy/compose.dev.yaml` |
| `FXBOT_PORT` | The API's port. Default 8787, a release install's; `npm run dev` uses 8788 unless this is set in the shell |
| `FXBOT_HOST` | The address the API listens on. Default 127.0.0.1. fxbot's image sets 0.0.0.0, and compose publishes the port on the machine's 127.0.0.1 |
| `FXBOT_SECRET_KEY_FILE` | Required. A file outside the repo with 32 random bytes in base64. It seals every key and token fxbot stores |
| `FXBOT_VERCEL_CLIENT_ID` | Optional. fxbot's own Vercel OAuth app, for signing in with a Vercel account |
| `FXBOT_DATA` | Plugins' files. Chats from before 0.4.0, in its `sessions/`, move into the database on the first start, which renames the folder `sessions.moved`. Default `./data` |
| `FXBOT_CLIENT_METADATA_URL` | Optional. The project's published OAuth client document, for MCP servers that sign in with one. Without it, fxbot registers itself with each server |
| `FXBOT_MCP_REGISTRY` | Optional. The MCP registry that fxbot mirrors hourly for search, and that registry entries come from. Default GitHub's, `https://api.mcp.github.com` |
| `FXBOT_MCP_EVERYTHING` | Optional. The registry that Search everything asks, once per search. Default the official one, `https://registry.modelcontextprotocol.io` |
| `FXBOT_LISTS_URL` | Optional. The site that publishes fxbot's own lists of the plugins it vets: MCP servers, skills, and packages. fxbot reads its `mcp-registry.json`, `skills-registry.json`, and `plugins-registry.json` hourly, and keeps the lists the release shipped with until a read succeeds. Default fxbot's site, `https://fxbot.sh` |
| `FXBOT_BACKUPS` | Where the database and `FXBOT_DATA` are backed up before migrations run. Default `./backups`. The backup uses `pg_dump`, which must be Postgres 17's |
| `FXBOT_CONTROL` | Set by a release install's compose file: the folder where the app asks the machine for updates. Without it, Settings doesn't update |
| `FXBOT_EMBED_URL` | Optional. The local embedder for memory search, an OpenAI-style address such as `http://127.0.0.1:8081/v1` from `deploy/compose.dev.yaml`. A release install's compose file sets it. Without it, there is no local embedder |
| `FXBOT_PLUGIN_DIRS` | Optional, for writing a plugin in a checkout. Plugin folders, separated by `:`, that fxbot adds on first sight and loads at start, unpinned. It loads one again a moment after its files change |
| `FXBOT_UPDATE_CHECK` | `off` stops the daily check for a newer release, which asks GitHub about the repository in `package.json` |
| `FXBOT_RELEASES_URL` | Optional. Where that check reads the newest release, in the shape of GitHub's `releases/latest`, for a fork or a mirror |

One-time setup, for a checkout you run as yourself. Its database and local embedder run in containers of their own, on ports 5433 and 8081, and its names stay clear of a release install's (`fxbot`, `/etc/fxbot`, port 8787), so both can run on one machine. For everyday use, install a release instead.

```sh
sudo apt install podman docker-compose postgresql-client-17     # or Docker; the client is for backups. On Ubuntu: docker-compose-v2, not docker-compose, which is v1
sudo install -d -o "$USER" -m 700 /etc/fxbot-dev
openssl rand -base64 32 > /etc/fxbot-dev/secret.key && chmod 400 /etc/fxbot-dev/secret.key
pw=$(openssl rand -hex 16)
printf '%s\n' "FXBOT_DB_PASSWORD=$pw" "FXBOT_DATABASE_URL=postgres://fxbot:$pw@127.0.0.1:5433/fxbot_dev" FXBOT_EMBED_URL=http://127.0.0.1:8081/v1 FXBOT_SECRET_KEY_FILE=/etc/fxbot-dev/secret.key > .env
systemctl --user enable --now podman.socket                             # podman compose runs docker-compose through it
podman compose -f deploy/compose.dev.yaml --env-file .env up -d        # or docker compose
```

A checkout set up on the machine's own Postgres, before 0.3, moves its database across with:

```sh
pg_dump --format=custom fxbot_dev > fxbot_dev.dump
podman compose -f deploy/compose.dev.yaml --env-file .env exec -T db pg_restore -U fxbot -d fxbot_dev --no-owner < fxbot_dev.dump
```

Then add providers in Settings: a ChatGPT, Grok, or Vercel account by device code, an API key, or a local server such as Ollama. The page sends a key once and never gets it back. To seal everything under a new key, stop the server and run `npm run rotate-key -- <new key file>`, then point `FXBOT_SECRET_KEY_FILE` at that file.

`npm run prod` is the production build on its own: it builds the page into `packages/ui/dist/`, then serves it and `/api`. The API that `npm run dev` starts serves the last build there too. On a machine with a release install, give either another port than 8787 with `FXBOT_PORT`.

To reach the development page from your other devices, serve it on your tailnet, with HTTPS:

```sh
tailscale serve --bg 5173                 # npm run dev, at https://<machine>.<tailnet>.ts.net
```

An app installed from that address is the development page, so every change shows up as it lands, but it cannot open while `npm run dev` is down. fxbot has no login of its own, so do not expose its ports any other way.

## Releasing

`main` holds releases only, and every commit on it is one. Work happens on `release/<next version>`, made from `main` after each release; `npm run dev` runs from that branch. When the branch is ready:

```sh
npm version 0.2.0 --no-git-tag-version     # package.json and the lockfile
# CHANGELOG.md: rename "## Unreleased" to "## 0.2.0 (<date>)", with a Before upgrading list if it adds migrations
# docs/releases/0.2.0.md: the release's notes, shaped like the last one's
git add docs/releases && git commit -am "Release 0.2.0"
git switch main && git merge --ff-only release/0.2.0 && git push
git switch -c release/0.3.0 && git push -u origin release/0.3.0
```

The [release workflow](.github/workflows/release.yml) typechecks and builds the new version, checks that no shipped migration changed, builds fxbot's image for amd64 and arm64 and pushes it to ghcr.io, then tags it and publishes a GitHub Release with `docs/releases/<version>.md` as its notes. Those notes are a short post, to paste anywhere, and they're what Settings shows above **Update**, so a release with a **Before upgrading** says so above its list of changes. GitHub makes a new package private: after the first release with an image, make it public once, in the package's settings (**Change visibility**). It runs only on `main`: release branches are for work, and never publish. A prerelease, such as `0.3.0-rc.1`, is published only when you merge one into `main`. A fix to a release goes on `release/0.2.1` from `main`, and is merged into the open release branch after.

## Status

v1 is built: bot profiles drawn as animated blobs, a streaming chat that survives reloads and server restarts, image and text file attachments, and an installable shell that opens offline. [Provider logins](docs/_completed/phases/provider-logins.md) is built too: device code sign-in, API keys and local servers, model discovery, sealed secrets in Postgres, and provider switches that carry a summary over. The [library](docs/_completed/phases/library.md) is built as well: one copy of every file the chats hold, images and text files sent and documents a bot saves, each tagged with the bots and chats it came from. The bento button beside Settings opens it across every bot, with search and filters, and a panel beside each chat shows that bot's own. Bots search, read, and save it through three tools. [MCP servers](docs/_completed/phases/mcp.md) are built: the puzzle button beside the library adds a remote server by its address, signs in with OAuth or takes a key, and gives the tools you allow (the read-only ones to start) to all bots or the bots you choose. [Plugin search](docs/_completed/phases/addons.md) put a search above that page: fxbot mirrors GitHub's MCP registry hourly, opens each entry's page before adding it, and marks an installed server that has a newer version, is deprecated, or was removed, and updates it only when asked. [Skills](docs/_completed/phases/skills.md) come from fxbot's own list and skills.sh, pinned to a commit of their GitHub repository: each bot sees a short list of its skills, and a `skill` tool reads one when a task needs it. In a chat, `$` or `/` picks one to send with a message. The [PWA phase](docs/_completed/phases/pwa.md) made fxbot an app to install from the tailnet address: Chrome's own Install button, the steps on an iPhone, and room for the notch, the home indicator, and the keyboard. The production build also opens offline, and its new builds wait for Reload. [Releases](docs/_completed/phases/releases.md) are built: `setup.sh` installs a tagged release, Settings updates to the next with one button, and the database moves forward through numbered migrations, backed up first. [Memories](docs/_completed/phases/memories.md) are built: each bot saves what it learns with three tools, the newest go in its instructions on every turn, and the owner sees, edits, and deletes them on the bot's edit screen. Memory search and `chat_history` match by words and by meaning, with vectors from a local embedder on the CPU or a GPU, or a provider's. [Containers](docs/_completed/phases/containers.md) replaced how it installs: `setup.sh` runs fxbot and pgvector's Postgres as containers, with podman or docker, and Settings' Update asks the machine's `fxbot` command, which goes back to the old release if the new one doesn't start. [Plugins](docs/_completed/phases/plugins.md) are built: code that runs inside fxbot, with hooks into turns and tool calls, tools, routes, tables, settings, and places in the page, and fxbot's first two, chat rooms and herdr, of which herdr left in 0.4.1, to be planned again. Everything an owner installs is [one kind of plugin](docs/_completed/phases/one-kind-of-plugin.md), carrying any mix of code, MCP servers, and skills, and only the ones fxbot vets show until a switch in Settings. The [agent computer](docs/_completed/phases/computer.md) is built: a Linux computer for each bot, in the machine's own podman or docker, run rootless, checked on both engines here. [Computer v2](docs/_completed/phases/computer-v2.md) gave it a desktop the owner watches and takes over, a shared terminal, and Chromium on the desktop, with tools to drive them by pixels, accessibility trees, and text, and took the browser plugin into it. All of it was checked against mock servers, stubbed sign-in services, and Chromium on this machine, not with real accounts, models, or phones. The [v1 plan](docs/_completed/v1-plan.md) and the phase pages record what was checked.

## License

[Apache License 2.0](LICENSE). The vendored `show-me` skill in `.agents/skills/` keeps its own MIT license.
