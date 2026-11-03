# Agent computer

Each bot gets a Linux computer of its own to use during its turns: a shell, files that last, and the programs other plugins install. The computer is a plugin. A bot with it on runs commands, reads and writes files, and shares what it makes to its library. Other plugins add programs to every computer through setup steps, the way the browser plugin in this phase adds a web browser. Computers start on a bot's first call and stop when they sit idle. They run in a rootless container engine that belongs to a user of their own on the machine, so they stay apart from fxbot's own files and from each other. From [issue #6](https://github.com/iammrduncan/fxbot/issues/6).

Status: planned, not built. Research and plan only, written on 2026-11-02. On 2026-11-03 it was checked against the code after [one kind of plugin](../_completed/phases/one-kind-of-plugin.md) (the `sh.fxbot` namespace, Plugins, vetted lists) and the docs' move to Starlight, and brought up to date. It builds on the [plugin API](../_completed/phases/plugins.md), and on the [containers](../_completed/phases/containers.md) install for the app's side of the engine. A checkout runs it as well. The issue asked for computers before plugins. Since then the stub made the computer a plugin, so this phase comes after plugins. Build it on the open release branch, a milestone to a commit.

## 0. Core or plugin

**Plugin: a plugin that other plugins build on** ([Core or plugin](../../CONVENTIONS.md#core-or-plugin)). Many bots need no computer: chat, the library, MCP servers, and skills work without one. The core's own tools reach only its own data. A shell, a machine's files, and a browser are plugins. A bot gets a computer only while the plugin is on for it: like any plugin, it is on for every bot once added, and its **Bots** setting narrows that. An owner who never adds the plugin runs no engine, no timer, and no image.

The core never names the computer. The plugin API gains the smallest pieces the computer and its first dependent need:
- **`needs` in a plugin's manifest:** the plugins a plugin needs, each with a block of settings for that plugin. The browser plugin uses it to give the computer its setup steps.
- **`fx.dependents()`:** what the plugins that need this one asked of it.
- **`fx.library.read` and `fx.library.save`:** to move files between a bot's library and its computer.
- **`fx.skills.files`:** a skill's files, so scripts can run on the computer.

A way for one plugin's code to call another's, such as `fx.need("computer")`, waits for the first plugin that needs it. The browser plugin is setup steps and a skill, with no code, which a plugin can already be since one kind of plugin.

## 1. Research

Checked on 2026-11-02 against each project's source and docs, and with prototypes on this machine (Debian 13, podman 5.4.2). Clones and prototypes stayed in the scratchpad and were removed. Where a point is missing, the source doesn't cover it.

### The references

**Grok bot** ([computer and apps](https://docs.x.ai/grok-bot/computer-and-apps), [teams](https://docs.x.ai/grok-bot/teams-and-enterprises)):
- "Each Bot works on a persistent cloud computer with a browser, filesystem, and terminal", in Cursor's cloud. "Every Bot on your account uses the same computer": files and command-line credentials are shared. Each bot has its own screen, but "the screens are separate work surfaces, not separate security boundaries".
- It is "one persistent Firecracker microVM per user". `/workspace` persists. Installed packages, `node_modules`, and virtual environments don't survive an update, Recover, or Reset. "Idle computers are recreated on the new image in the background", and "Hibernation is not deletion."
- Programs install through Enterprise "Team Setup Scripts", which run again "when a computer starts, on the periodic refresh, or when you recreate it". MCP servers are added "by URL or by a command that runs on its computer".
- Network access defaults to allow-all. Sizes, idle timing, and tool schemas aren't documented.

**CopilotKit OpenBot** (`cd3b457`):
- **Shape.** A `supervisor` service is the only process with the Docker socket. It offers four verbs (`ensure`, `stop`, `reset`, list), names containers from checked ids, and checks an ownership label (`supervisor/src/index.ts:132-233`, `docker.ts:28-30`). It started at one computer per bot and moved to one per person, where each bot gets its own browser profile and folder. Its own note says those bots "are not kept from each other" (`server/src/computer/computer-key.ts:20-26`).
- **Image.** Ubuntu 24.04 with Node, Bun, Playwright's Chromium, and an HTTP daemon on port 4100. It is 518–535 MiB compressed. The all-in-one install idles at 409 MB with one bot (`docs/deployment.md:101-112, 251-253`).
- **Containers** drop all capabilities, set `no-new-privileges`, and limit pids to 512. Memory is limited only when set, and CPU never (`docker.ts:466-514`). The Docker path has no idle stop.
- **Tools:** `computer_run_command {command}`, `_read_file`, `_write_file`, `_list_files`, and browser tools that use accessibility refs, not pixels (`headless-tools.ts:117-274`).
- **Commands:**
  - Commands run with `bash -c`, not `-lc`, "so a planted `.bash_profile` cannot change what runs".
  - Each runs in its own process group, killed on timeout or Stop. Timeouts are 120 s by default and 600 s at most.
  - Output keeps the last 64 KB of each stream (`shell.ts:26-37, 250-274`).
- **Network.** It moved Postgres to its own network because "the gateway on :5432 answered" from inside a computer (compose `1-35`). An egress proxy in the computer filters HTTP, which "a process that… opens a raw socket" gets around (`egress.ts:180-181`).
- **No stdio MCP.** It has no way for plugins to install programs either.
- **OpenDuet** vendors an older copy that keeps one computer per bot. **OpenDots** runs OpenBot's image with one computer per Dot, and gives each computer a token derived from the master token.

**CopilotKit openmuse** (`a4944f4`):
- One computer per owner: `node:22-bookworm-slim` with bash, python3, and git, running as uid 1000.
- Each starts with `--read-only --cap-drop ALL --network none --memory 512m --cpus 1 --pids-limit 128` and a `/workspace` volume.
- Commands go through `docker exec … timeout 30s bash --noprofile --norc -c`. Output is capped at 128 KB and files at 256 KB (`apps/server/src/computer-backend.ts:222-318`).
- An optional E2B desktop pauses after 15 idle minutes.

**eve** (`55dc41f`):
- One sandbox per session, with tools `bash {command}`, `read_file`, and `write_file`.
- `bash` keeps the last 50 KiB of output. After 30 s it returns `running`, a pid, and a job folder that the model reads with `tail` and stops with `kill` (`docs/concepts/built-in-tools.md:27-55`).
- Its Docker provider runs `docker run -d … sleep` and then `docker exec`, through the host's docker command.
- **How plugins install programs.** An extension's install step runs once per template (a Docker image or a snapshot). A key forces a rebuild when the plugin's version changes. agent-browser's eve extension runs apt, `npm i -g agent-browser`, and `agent-browser install` that way (`packages/@agent-browser/eve/extension/lib/sandbox.ts:121-160`).
- "The file tools run in the app runtime and proxy into the sandbox", which holds "no secrets".

**fx and libfx 0.0.16** (`0d1b727`, the installed package):
- **fx's own tools:** `shell` (`run`, `interact`, `stop`, with a 30 s yield before it hands back a session id), `read_file`, `write_file`, `edit_file`, `glob_files`, and `grep_files`. Results are capped at 64 KiB, keeping the start, and the rest is paged with `read_tool_result`.
- **Calls at once.** "On the native backend, calls to idempotent tools from one model response run at the same time, up to 16 at once. A tool that isn't idempotent runs alone" (libfx's README). A host tool's context has the call's `executionId`, which fxbot's plugin API doesn't pass on.
- **No sandbox.** fx has had none on Linux since 0.0.5, which retired its sandbox setting.
- **libfx gives no shell or file tools.** The native backend "doesn't turn on fx's built-in shell or file tools". `FxWorkspace` (`exec` with `timeoutMs` and `outputLimitBytes`) belongs to the browser terminal, not to agents. So the computer's tools are host tools.
- **Images in results.** A host tool can return an `FxToolResult` with up to 8 images, so a bot can look at a screenshot it took.

**durable-harness** (`135dee5`) rebuilds fx's tools as host tools over a Vercel Sandbox per session. Its sandbox interface is `open`, `exec({cwd, timeoutMs, signal})`, `writeFiles`, `readTextFile`, `start` and `waitFor` for jobs, and `killCommand`. Commands in the VM run as an unprivileged user.

**Pi** (`0a4fad5`):
- Tools `read`, `bash {command, timeout?}`, `edit`, and `write`. Output is cut at 2,000 lines or 50 KB: bash keeps the end and saves the whole output to a file, and read keeps the start, with an offset to go on.
- Each bash call is a new shell in its own process group.
- No sandbox. Its docs call a container or VM "usually the strongest practical option".
- Every tool takes pluggable operations, and its Gondolin example moves all of them into a micro-VM that starts on first use.

**agent-browser** (v0.41.1, `43c78a7`):
- A Rust command-line tool. The first command starts a daemon that drives Chrome over CDP, and the daemon exits after an hour idle.
- On Linux it finds `chromium` on its own (`docs/content/docs/engines/chrome.mdx`), and adds `--no-sandbox` in a container.
- `snapshot -i` gives accessibility refs (`@e1`), and `screenshot` writes a PNG.
- Binaries ship for Linux x64 and arm64. Its skill is a stub that sends the agent to `agent-browser skills get core`.

**agent-desktop** drives an existing desktop through its accessibility tree, and needs a running session with a bus. **fx0** has no shell or files.

### Others

- **Anthropic's computer use** (`computer_toolset_20260801`) works in the pixels of the screenshots the app returns, and recommends 1024×768 or 1280×720. Its reference container is Xvfb, mutter, x11vnc, and noVNC, about 1.2 GB compressed. Its bash tool takes `{command}`, and the docs say to "give every command a deadline" and kill the process group.
- **E2B** runs a daemon in each sandbox, with `commands.run(cmd, {timeoutMs: 60000, background})`, file calls, and pause and resume. **Vercel Sandbox** has `runCommand`, `writeFiles`, and `readFile`, snapshots the files on stop, and resumes on the next call.

### Running a computer on this machine

Prototypes against podman 5.4.2. The rootless runs used an existing unprivileged user with lingering on, and were removed afterwards.

**Bots can't be kept apart inside one container.** bubblewrap inside a podman container fails with "Creating new namespace failed: Permission denied", as root or not, even with seccomp off. With AppArmor off too, it still can't mount `/proc`, because podman masks parts of it. Each bot in its own container keeps bots apart without loosening anything.

**A computer costs almost nothing until it works.** A container running `sleep` with `--init`:

| | Measured |
| --- | --- |
| Memory at idle | about 150 kB in the container, plus about 2 MB for podman's monitor process |
| Create and start | 110–150 ms with the command; 15–20 ms and 45–85 ms through the API |
| Running a command | 60–70 ms through the API, 100–120 ms with the command |
| Stop, then start | 100–230 ms, then 40–95 ms. Files written outside a volume were still there |
| Disk per computer | its changed files (20 KB after a test file), plus its volume |

**The engine's API is enough.** A Node script drove podman's Docker-compatible API over a unix socket, with no daemon in the computer:
- `exec` returned the exit code and the output. Output came as framed stdout and stderr, and 2 MB came through in 85 ms.
- `timeout -s KILL` ended a command (exit 137).
- Files went in through `PUT /archive` (a one-file tar, about 20 lines to write) and came back through `GET /archive`. A file in the volume survived a stop and start.
- `POST /build` made an image from a Containerfile sent as a one-file tar.
- An exec with stdin attached, over the upgraded connection, echoed lines back. That is the path a local MCP server would use later.

**Limits need the engine user's systemd.**
- Under the user's own systemd, with its D-Bus session, the computer got `memory.max` 536870912, `pids.max` 256, and `cpu.max` 100000 100000, as asked.
- Started any other way, rootless podman fell back to cgroupfs and set no limits at all, without failing. That held even inside a delegated system unit.
- Root in the computer is the engine user on the host. Every other uid maps into that user's subordinate range.

**The app can reach the engine without holding a root socket.**
- A rootful container running as another uid, given the engine user's group, listed containers through the bind-mounted socket in 29 ms. Without the group it got `EACCES`.
- The rootful engine's `/info` lists no `name=rootless` in `SecurityOptions`, so the plugin can refuse a rootful engine.

**What a computer can reach.** From a rootless container with podman's default network (pasta):

| Address | Reached |
| --- | --- |
| The internet (1.1.1.1:443) | yes |
| A service on the machine's 127.0.0.1 only (fxbot's port), through `host.containers.internal` | no |
| A service on all of the machine's addresses (sshd), through `host.containers.internal` | yes |
| The machine's tailnet address on 443, where Tailscale Serve puts fxbot | **yes** |
| The LAN's router | yes |

fxbot has no login of its own, so a computer that reaches the tailnet address can drive fxbot's API. pasta opens each connection as the engine user, on the machine. A temporary nftables rule matching that user's uid (`meta skuid`) refused one address from inside the computer, while root's connections to that address went through. The rule was then removed.

**A browser fits.** Debian 13 slim with `ca-certificates curl git python3 procps ripgrep jq unzip xz-utils` is 230 MB, built in 17 s. Adding agent-browser's binary and Debian's `chromium` brings it to 961 MB, built in 18 s more. In a container from that image, as root, `agent-browser open https://example.com`, `snapshot -i`, and `screenshot` took 630 ms in all. The container used 193 MB with the page open, and went back to about 150 kB after `agent-browser close`. That run was on the machine's rootful podman; the rootless run is a check.

## 2. Key takeaways

1. **One computer per bot.** It costs about 2 MB while running idle and nothing when stopped. It starts in about 0.1 s, and keeps bots apart without loosening the container. Grok bot and OpenBot share a computer per person and say plainly that it isn't a boundary between bots. fxbot's bots are of one owner too, but separate computers cost nothing more here.
2. **No daemon in the computer.** The plugin uses the engine's own API for commands, files, and builds, so a computer is `sleep` under an init. That is what keeps it at 150 kB.
3. **A rootless engine of its own.** A `fxbot-computer` user on the machine runs rootless podman, whose socket is mounted into the app with that user's group. A container escape lands in an unprivileged user that can't read fxbot's files. The app never holds a root socket, as [containers](../_completed/phases/containers.md) requires, and the plugin refuses an engine that isn't rootless.
4. **The engine user's own systemd,** with lingering and its D-Bus session, or limits are silently dropped.
5. **The internet only, by uid.** An nftables table refuses the engine user's connections to the machine, its tailnet, the LAN, and the container networks, except DNS to the machine's resolvers. It is one rule set on the host, and it covers every computer whichever way a process connects.
6. **Plugins install programs as image layers.** Each plugin that needs the computer names setup steps, as eve's extensions and Grok bot's setup scripts do. The computer builds one image from them, which every bot's computer shares, so Chromium is on disk once. A bot's own `apt-get` lasts until the image changes. Its home lasts until it is reset.
7. **Four tools, in the shape the references share:** a shell that takes one command, with a deadline and a process group; reading a file, an image included; writing one; and sharing one to the library. The shell keeps both ends of long output and the whole of it in a file, as Pi does. There are no interactive shell sessions: a server runs with `setsid`, as fx's own description says.
8. **Host setup is the plugin's, and the owner runs it once.** The plugin ships the script, and its Settings section shows the command and the script's text. The core's host command never names it. `compose.override.yaml` gives the app the socket: the host `fxbot` command already adds that file when it exists (`deploy/fxbot`), and updates and `setup.sh` leave it alone.

## 3. Implementation

### The plugins

Both live in this repository, outside the workspaces, as [plugins](../_completed/phases/plugins.md#5-open-questions) question 1 has it, and are added from fxbot's list like anyone's.

```text
plugins/computer/
├── README.md                what it is, its files, and how to build page.js, as herdr's README has
├── plugin.json
├── fxbot/
│   ├── server.ts            the engine client, computers, tools, and routes
│   ├── fxbot-run            copied into the image: runs one command
│   ├── page.jsx             its Settings and bot settings sections
│   └── page.js              page.jsx, built with rolldown
└── host/setup.sh            run once on the machine, as root

plugins/browser/
├── README.md
├── plugin.json              setup steps for the computer
└── skills/browser/SKILL.md
```

fxbot writes every text file of a plugin from GitHub to `<FXBOT_DATA>/plugins/<name>/<commit>/`, so `server.ts` finds `fxbot-run` and `host/setup.sh` beside itself, through `import.meta.dirname`. `page.js` is built as herdr's is: `npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js`.

`plugins/computer/plugin.json`:

```json
{
  "name": "computer",
  "version": "0.1.0",
  "description": "A Linux computer for each bot: a shell, files, and the programs other plugins install.",
  "license": "Apache-2.0",
  "extensions": {
    "sh.fxbot": {
      "server": "./fxbot/server.ts",
      "page": "./fxbot/page.js",
      "settings": [
        { "name": "engine", "description": "The rootless engine's socket", "default": "/run/fxbot-computer/engine.sock" },
        { "name": "memoryMiB", "description": "Memory for each computer", "default": "2048" },
        { "name": "cpus", "description": "CPUs for each computer", "default": "2" },
        { "name": "idleMinutes", "description": "Minutes without a call before a computer stops", "default": "15" }
      ]
    }
  }
}
```

### The plugin API pieces (`packages/sdk/src/plugins.ts`)

- **`needs`.** A manifest's `extensions["sh.fxbot"].needs` maps plugin names to a JSON object for each, at most 16 KiB in all. `parseManifest` checks it, and `Manifest` and the plugin's view gain it.
  - The plugin page shows "Needs computer". Add is off until that plugin is added, and the SDK refuses it with "Add computer first."
  - Removing a plugin that others need is refused, naming them.
  - Plugins load after the ones they need.
  - A bot's plugin switches note "Needs computer on this bot" beside a plugin whose needed plugin is off for that bot.
- **`fx.dependents()`** returns `{ name, version, needs }` for each added plugin that needs this one, where `needs` is its block for this plugin. A new hook event, `fx.on("dependents", …)`, hears adds, updates, and removals.
- **`fx.library.read(bot, id)`** returns an item's name, type, and bytes, if the item is tagged for that bot: the library's `get` and `file`, with the tag check `library_read` makes. **`fx.library.save({ bot, session, name, type, bytes })`** is the library's `save`, with its checks and origin `generated`.
- **`fx.skills.files(bot, name)`** returns the files of the skill that bot sees by that name, as `{ path, text }`: the `resources` of the skills rows the core `skill` tool reads, found as it finds them.

No migration: `needs` is kept in the plugin's stored manifest, as its settings are. A plugin with neither `server` nor `page`, such as the browser, can already be added. About 75 lines in the SDK (`plugins.ts`, `plugin-api.ts`, and a few in `library.ts` and `skills.ts`), plus the "Needs" lines on the plugin page and a bot's switches in `packages/ui`. The server gains nothing: the plugin's routes go through the plugin API.

### The engine (`host/setup.sh`)

The owner runs it once, as root. The plugin's Settings section shows the exact command, from the pinned files fxbot already keeps, and the script's text under it, so the owner reads what runs as root first. In a release install the command is `sudo bash /var/lib/fxbot/data/plugins/computer/<commit>/host/setup.sh`: the app's container mounts that folder at the same path as on the machine. For a checkout, the path is under its own `FXBOT_DATA`, or in `plugins/computer/` when `FXBOT_PLUGIN_DIRS` loads it, and the command adds `--user <login>`. The script is about 110 lines and safe to run again. In order:
1. **Checks:** root, systemd, apt, and podman 4.9 or newer available (Debian 13, Ubuntu 24.04).
2. **Packages:** `podman uidmap passt dbus-user-session`, with `--no-install-recommends`. A machine that runs fxbot under docker gets podman beside it, for computers only.
3. **The user:** `fxbot-computer`, a system user with its home at `/var/lib/fxbot-computer` (mode 0750), a subordinate uid and gid range of 65,536 that doesn't overlap another, and lingering on.
4. **Its socket:**
   - A drop-in for the user's `podman.socket` listens on `/var/lib/fxbot-computer/run/engine.sock`, mode 0660, in a folder of its own.
   - The script enables it through the user's manager (`runuser -u fxbot-computer -- systemctl --user enable --now podman.socket`).
   - podman starts when the socket is used, and exits 5 s after the last call.
5. **The firewall:**
   - `/etc/fxbot/computer.nft` holds a table `inet fxbot_computer`. Its output chain matches `meta skuid fxbot-computer`.
   - It accepts DNS (53, udp and tcp) to the nameservers in `/etc/resolv.conf`.
   - It rejects 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10, 169.254.0.0/16, and multicast, and `::1`, `fc00::/7`, `fe80::/10`, and `ff00::/8` for IPv6.
   - `fxbot-computer-firewall.service` (oneshot, `nft -f`) loads it at boot.
6. **The app's access:**
   - **A containers install:** the script writes `/opt/fxbot/compose.override.yaml`, which mounts `/var/lib/fxbot-computer/run` at `/run/fxbot-computer` with the user's gid in `group_add`, then runs `fxbot up`. The [containers](../_completed/phases/containers.md) phase's `fxbot` command already adds that file to `COMPOSE_FILE` when it exists, and its updates and `setup.sh` leave it alone.
   - **A checkout:** `--user <login>` adds that user to the `fxbot-computer` group. The plugin's `engine` setting is then `/var/lib/fxbot-computer/run/engine.sock`.
7. **It prints** the socket path and what it changed.

`--name <user>` picks another user name, for checks beside a real install. `setup.sh --remove` takes it all away: the computers and images (`podman system reset` as the user), the user, its home, the firewall, the unit, and the override. It then runs `fxbot up`.

The folder is mounted rather than the socket file, because a socket made again by systemd would leave a mounted file pointing at the old one.

### The image

The computer builds `localhost/fxbot-computer:<12 hex of the Containerfile's hash>` through `POST /build`, from a tar holding the Containerfile and `fxbot-run`:

```dockerfile
FROM docker.io/library/debian:trixie-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 procps ripgrep jq unzip xz-utils \
  && rm -rf /var/lib/apt/lists/*
COPY fxbot-run /usr/local/bin/fxbot-run
# browser 0.1.0
RUN case $(dpkg --print-architecture) in … esac && curl -fsSL -o /usr/local/bin/agent-browser …
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
```

- **Each dependent's steps** follow in name order, each step a `RUN`, with a comment naming the plugin and its version. Steps run as root, with the network.
- **The base** is 230 MB, measured. Node isn't in it: Debian's is 20.x, and a plugin that needs Node installs the one it wants.
- **When it builds.** On a bot's first call, if the image for the current hash is missing. Again when `dependents` changes, in the background. Build lines go to the plugin's log. A failed build keeps the old image, and the error shows on the plugin's row.
- **Old images** are removed once no computer uses them.

`fxbot-run <id> <seconds> <command>` is 12 lines of bash, where `<id>` is a random id the plugin makes for the call. It runs the command with `setsid timeout -s KILL <seconds> bash -c`, writes the output to `/tmp/fxbot/<id>.log` and the process group to `/tmp/fxbot/<id>.pid`, and waits. Then it prints the whole output if it is 64 KiB or less. Otherwise it prints the first 4 KiB, a line saying how much was cut and where the rest is, and the last 60 KiB. It exits with the command's code.

### Computers (`fxbot/server.ts`)

| | |
| --- | --- |
| Name | `fxbot-computer-<bot id>`, labelled `fxbot.computer=<bot id>` and `fxbot.image=<hash>` |
| Command | `sleep infinity`, with `Init: true` |
| Home | volume `fxbot-computer-<bot id>` at `/root`, where commands start |
| Limits | `Memory` and `NanoCpus` from the settings, `PidsLimit` 512, `ShmSize` 512 MiB for browsers |
| Network | the engine's default (pasta), under the firewall above. No ports published |
| Restart | none. The plugin starts it |

- **The first call** builds the image if needed, makes the volume and the container, and starts it. A later call to a stopped computer starts it (about 0.1 s). A computer on an old image is made again from the new one when it next starts; its home stays.
- **One start at a time.** Each bot has one start in flight at most, and calls in parallel wait on it. One image build runs at a time for all bots.
- **Idle stop.** A computer with no call for `idleMinutes` stops. One timer runs while any computer runs, and none runs otherwise.
- **After fxbot restarts,** the plugin lists containers by label and counts the running ones as just used.
- **A deleted bot's** computer and home are removed when the plugin loads, and whenever the idle timer stops a computer.
- **The engine check.** On load, and when the setting changes, `GET /info`:
  - no answer: the Settings section shows the host command
  - no `name=rootless` in `SecurityOptions`: the plugin refuses, with "This engine runs as root. Run the computer's setup script."
- **The engine client** is Node's `http` over the socket: JSON calls, the 8-byte frames of exec output, and one-file tars. About 90 lines, with no package.

### Tools

The plugin's tools reach only the bots it is on for, named `computer_<tool>`:

| Tool | Input | Does |
| --- | --- | --- |
| `computer_shell` | `command`, `timeout` (seconds, default 120, at most 600) | Runs `fxbot-run` with an id it makes for the call. Returns `exit <code>` and the output, or "Stopped after <n> s". When the call's `signal` aborts (the turn is cancelled), a second exec kills the process group. |
| `computer_read_file` | `path`, `offset`, `limit` (lines) | Text: up to 2,000 lines or 256 KiB from `offset`, saying where it stopped. An image (PNG, JPEG, GIF, or WebP, up to 3.75 MiB) comes back as an image, so the bot sees it: a libfx `FxToolResult`, as `library_read` returns one. |
| `computer_write_file` | `path`, and `text` or `library` (a `library:<id>`) | Writes the text, or the library item's bytes, making folders as needed. Text up to 1 MiB. |
| `computer_to_library` | `path`, `name` (optional) | Saves an image (up to 3.75 MiB) or a text file (up to 1 MiB) from the computer to the bot's library, tagged for the chat, and returns its `library:<id>`. Other files are refused, since the library keeps only images and text. |

- **Relative paths** start at `/root`. The bot is root on its own computer, so there is no path check: everything there is the bot's.
- **Calls in parallel.** `computer_shell` has `idempotent: false`, so libfx runs each of its calls alone. The others are idempotent, so calls from one response run at once: writing the same bytes twice, or saving the same item, changes nothing.
- **Commands get** `HOME=/root`, the image's `PATH`, and `DEBIAN_FRONTEND=noninteractive`, and no environment from fxbot.
- **`computer_shell`'s description** tells the bot:
  - that this is its own Debian computer, where it is root
  - that `/root` is kept, while programs it installs last until the computer is rebuilt
  - that a server keeps running with `setsid cmd > log 2>&1 &` until the computer stops after its idle minutes
  - where the whole of a long output is
  - that the computer reaches the internet, but not this machine or its network
- **Skills that run scripts.** On `tool.after` of the core `skill` tool, for a bot the plugin is on for, when `fx.skills.files(bot, name)` has files besides `SKILL.md`:
  - The hook notes the skill for that bot's computer, and adds a line to the result: "Its files are at /skills/<name> on your computer."
  - The plugin writes noted skills' files to `/skills/<name>/` before that bot's next computer call, and at once if its computer is running. The hook never starts a computer: a hook gets 5 s, and a first start can wait about 35 s for the image.

### The page (`fxbot/page.jsx`)

- **Settings section:**
  - the engine's state: ready, not reachable (with the host command to copy, and **Read the script** to show its text), or refused as rootful
  - the image's hash and size, or its build, live
  - each computer: its bot, running or stopped, its home's size, and its last use
  - **Rebuild image** (pulls the base again) and **Delete all computers**
- **A bot's settings section:** its computer's state, **Stop**, and **Reset**, which deletes the computer and its home after a confirm.
- **Routes**, under `/api/plugins/computer/`:
  - `GET status`
  - `GET script`, the setup script's text
  - `POST rebuild`
  - `POST bots/:id/stop` and `POST bots/:id/reset`
  - `DELETE computers`

The generic tool steps show the computer's calls in replies, so this phase adds no tool view. About 125 lines.

### The browser plugin

`plugins/browser/plugin.json`:

```json
{
  "name": "browser",
  "version": "0.1.0",
  "description": "A web browser on each bot's computer, driven with agent-browser.",
  "license": "Apache-2.0",
  "extensions": {
    "sh.fxbot": {
      "needs": {
        "computer": {
          "setup": [
            "case $(dpkg --print-architecture) in amd64) f=x64 s=2a89295b62ddd497986a9a80b52e1dbe4c1f6bd68ffde67eaae82eec2206af61 ;; arm64) f=arm64 s=f0b3bdaa40abf2a5111ec08e6d242110aaf56045ef5108cbc633bacc8e53ca17 ;; *) exit 1 ;; esac && curl -fsSL -o /usr/local/bin/agent-browser https://github.com/vercel-labs/agent-browser/releases/download/v0.41.1/agent-browser-linux-$f && echo \"$s  /usr/local/bin/agent-browser\" | sha256sum -c && chmod +x /usr/local/bin/agent-browser",
            "apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core && rm -rf /var/lib/apt/lists/*"
          ]
        }
      }
    }
  }
}
```

- **The binary** is checked against the release's sha256 for each CPU. The digests above are the ones GitHub lists for v0.41.1's `agent-browser-linux-x64` and `agent-browser-linux-arm64`, still the newest release on 2026-11-03. A newer release at build time means new digests from the same place. Debian's `chromium` runs on amd64 and arm64, where Chrome for Testing has no Linux arm64 build. agent-browser finds it by name.
- **`skills/browser/SKILL.md`** tells the bot:
  - to run `agent-browser skills get core` first
  - to save screenshots under `/root` and look at them with `computer_read_file`
  - to share what the person should see with `computer_to_library`
  - to close the browser when done, since an open page holds about 200 MB
- **A bot's switches.** A bot with the browser but no computer gets the skill and no shell, so its switches note "Needs computer on this bot", from the plugin API piece above.

### Speed and cost

- **Loading the page, sending, and streaming:** unchanged. The plugin's page code loads only when it is added.
- **A bot's first call** waits for the image: the base built in 17 s here, and the browser's layers in 18 s more. After that, starting a computer takes about 0.1 s, and each command about 0.1 s more than the command itself.
- **Memory:** about 2 MB for each running computer at idle, measured, and 193 MB with a browser page open. Each computer is held to `memoryMiB`.
- **Disk:**
  - 230 MB for the base image, or 961 MB with the browser, once for all bots
  - each bot's home
  - whatever a bot installs, until its computer is rebuilt
- **Nothing added:** no engine call, timer, or image until the plugin is added. With it added, nothing until a bot calls a computer tool.

### Not in this phase

- **Local MCP servers (stdio)** run on the bot's computer through an exec with stdin, which worked here. They come with a phase of their own, along with `fx.need()` for code that calls the computer. That phase also covers how registry entries with packages get added.
- **A desktop and computer use:**
  - Xvfb, a window manager, and xdotool as setup steps
  - a tool shaped like Anthropic's, with screenshots as image results
  - a live view in the app
- **Interactive shell sessions,** as fx's `interact`.
- **Per-bot setup steps,** disk quotas, and snapshots.
- **Docker's rootless mode.** The plugin would accept it, since `/info` says rootless, but the script sets up podman only.

### Size

About 780 lines in all, plus the two READMEs and the docs:

| Part | Lines |
| --- | --- |
| Plugin API pieces and the "Needs" lines | about 90 |
| `server.ts`: the engine client 90, computers and the image 130, tools and the skill hook 140, routes 35 | about 395 |
| `fxbot-run` | 12 |
| `page.jsx` | about 125 |
| `host/setup.sh` | about 110 |
| The browser plugin | about 40 |

## 4. Checklist

Checks use disposable Postgres, the mock model, Playwright, and fxbot's list served by the mock site, as the [plugins](../_completed/phases/plugins.md#4-checklist) checks do.

**About this machine.** Making a user, its lingering, an nftables table, and a systemd unit here needs the owner's go-ahead.
- **With it:** `setup.sh` runs with another user name (`--name fxbot-computer-check`), the checks run against that engine, and `setup.sh --remove` takes it away after.
- **Without it:** the checks run against an engine started by hand for an existing unprivileged user, as this research did, and the script becomes a human check.

**M1. The plugin API pieces**
- [ ] A scratch plugin that needs another: its plugin page says "Needs <name>", Add is off until that one is added, and the API refuses it with "Add <name> first." Removing the needed plugin is refused, naming the dependent.
- [ ] With both added, a bot that has the dependent on and the needed one off shows "Needs <name> on this bot" in its switches.
- [ ] `fx.dependents()` returns the dependent's block, and `fx.on("dependents")` fires when it is added, updated, and removed.
- [ ] `fx.library.read` refuses an item that isn't tagged for the bot. `fx.library.save` puts an image in the bot's library, tagged for the chat.
- [ ] `fx.skills.files(bot, name)` returns the files of the skill the bot sees by that name. The browser plugin, with no code parts, adds, and its skill joins the catalog.

**M2. The engine**
- [ ] `setup.sh`:
  - makes the user, its subordinate range, lingering, the socket at its path with mode 0660, the firewall table, and its unit
  - writes the override when `/opt/fxbot` exists, or adds `--user` to the group
  - leaves everything as it is when run again
  - `--remove` takes it all away
- [ ] The containers stack merges the override: after `fxbot up` and after an update, the app has the socket folder and the group.
- [ ] From the app's container (the containers stack) and from a checkout, the plugin reaches the engine. A rootful socket in the setting is refused with its message.
- [ ] The Settings section shows the host command with the right path, for a release install and for a checkout, and **Read the script** shows `setup.sh`'s text.
- [ ] A computer's `memory.max`, `pids.max`, and `cpu.max` match the settings.

**M3. Computers**
- [ ] A bot's first `computer_shell`:
  - builds the image, shows the build in the Settings section, and answers
  - a second bot's computer is separate: neither sees the other's files or processes
- [ ] After `idleMinutes` (set to 1 for the check), the computer stops. Its next call starts it, and `/root` is kept.
- [ ] Adding the browser rebuilds the image. A running computer moves to it on its next start, keeping `/root` and losing an `apt-get` the bot ran.
- [ ] Two images at once: the old one is removed when no computer uses it.
- [ ] After fxbot restarts, running computers are counted and stopped on time.
- [ ] Deleting a bot removes its computer and home.
- [ ] Stop, Reset, and Delete all computers work from the page.
- [ ] With the plugin added and no bot calling, no timer runs and no engine call is made after the load check.
- [ ] Three `computer_read_file` calls in one mock-model response, to a stopped computer, start it once.

**M4. Tools**, through the mock model:
- [ ] `computer_shell`:
  - returns the exit code and output for `echo hi; echo err >&2; exit 3`
  - stops a `sleep 999` with `timeout: 2` after 2 s
  - cancelling the turn kills a running `sleep`, with no process left (checked with `ps`)
  - for 2 MB of output, returns the first 4 KiB, the line naming the log, and the last 60 KiB, and the log holds it all
- [ ] A `setsid` server started by one call answers a `curl` in the next.
- [ ] `computer_read_file`:
  - pages a 5,000-line file by `offset`
  - returns a PNG as an image, which reaches the mock model's request as an image
- [ ] `computer_write_file` writes text into a new folder, and writes a library image's bytes.
- [ ] `computer_to_library` puts a PNG in the library panel.
- [ ] A bot with no computer yet reads a skill with a `scripts/` file: the hook returns at once, the file is in `/skills/<name>/` by its first computer call, and the bot runs it.

**M5. What a computer reaches**
- [ ] From a computer:
  - reached: the internet (HTTPS to a public host) and DNS
  - refused: fxbot's port, the machine's tailnet address, the database container, the LAN's router, `host.containers.internal`, and 169.254.169.254
- [ ] The rules hold after `systemctl restart fxbot-computer-firewall`.

**M6. The browser**
- [ ] The browser's setup steps build on amd64. The arm64 build is checked with `--platform linux/arm64` where emulation is installed, or else left to the human.
- [ ] Rootless, a scripted mock-model turn runs:
  - `agent-browser open https://example.com`
  - `snapshot -i` and `screenshot`
  - `computer_read_file` on the screenshot, which comes back as an image
- [ ] Memory with the page open is noted.

**M7. Docs and checks**
- [ ] The docs gain a how-to, `packages/website/src/content/docs/docs/how-to/give-bots-a-computer.md` ("Give bots a computer": add it, run the host command, and choose its bots), and a reference page, `docs/reference/computer.md` beside it (the tools, the settings, and what a computer reaches), each listed in `src/sidebar.ts`.
- [ ] The "Add a plugin" how-to shows a plugin that needs another. The SDK's Plugin API reference (`sdk/reference/plugin-api.md`) and its "Write a plugin" how-to cover `needs`, `fx.dependents()`, the `dependents` event, `fx.library`, and `fx.skills.files`.
- [ ] fxbot's `plugins-registry.json` lists the computer and the browser, tagged **fxbot**.
- [ ] `CHANGELOG.md` gains Unreleased lines for the computer, the browser, and the plugin API pieces.
- [ ] The computer's `page.js` is built from its `page.jsx` by its README's command, and both are committed.
- [ ] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass. `bash -n` and `shellcheck` pass on `setup.sh` and `fxbot-run`, where shellcheck is installed.

**The human runs these:**
- On their own install: add the computer, run the command it shows, and narrow its **Bots** to one bot. Ask the bot to make a chart with Python and share it, then check it in the library.
- Add the browser, and ask the bot to look something up on a site and send a screenshot.
- From a computer, check that fxbot's tailnet address doesn't answer.

## 5. Open questions

Each has a default that the build follows unless the owner changes it.

1. **One computer per bot, or one for all.** *Default:* one per bot. A running computer costs about 2 MB at idle, and a stopped one costs only its disk. Bots' files and processes stay apart, and programs are on disk once in the shared image. One for all would save nothing measurable here.
2. **The engine.** *Default:* rootless podman for a `fxbot-computer` user, set up by the plugin's script, on Debian 13 and Ubuntu 24.04. A docker machine gets podman beside docker. The other ways are a service that holds the root socket and checks every request, as OpenBot's supervisor does, or nested podman, which needs a loosened or privileged container.
3. **What a computer reaches.** *Default:* the internet only. An owner who wants a computer to reach a LAN service edits `/etc/fxbot/computer.nft` to accept it. A setting for this would need a request to the host.
4. **Sizes.** *Default:* 2 GiB of memory, 2 CPUs, 512 processes, and a stop after 15 idle minutes, in the plugin's settings, with commands at 120 s unless the bot asks for up to 600 s. OpenBot uses the same command limits, and openmuse stops its desktop after 15 idle minutes.
5. **Root in the computer.** *Default:* the bot is root there, which is the unprivileged engine user on the machine, so `apt-get` works with no sudo. The other way is a user inside the computer with sudo for apt only, as OpenBot's all-in-one image has.
6. **Removing the plugin.** *Default:* computers and homes stay until **Delete all computers** or `setup.sh --remove`, because a plugin's cleanup also runs on updates. The plugin's Settings section says so beside **Delete all computers**.
7. **Later phases.** *Default:* local MCP servers and a desktop with computer use get stubs of their own in `docs/phases/`, each planned when the owner asks.
