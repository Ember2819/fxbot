# Agent computer

Each bot gets a Linux computer of its own to use during its turns: a shell, files that last, and the programs other plugins install. The computer is a plugin. A bot with it on runs commands, reads and writes files, and shares what it makes to its library. Other plugins add programs to every computer through setup steps, the way the browser plugin in this phase adds a web browser. Computers start on a bot's first call and stop when they sit idle. They run in the machine's own container engine, podman or docker, whichever fxbot runs on, started rootless for a user of their own on the machine, so they stay apart from fxbot's own files and from each other. From [issue #6](https://github.com/iammrduncan/fxbot/issues/6).

Status: built on 2026-11-03, on the release/0.4.0 branch, as `plugins/computer` and `plugins/browser`, with the plugin API pieces in the SDK. Checked on this machine on podman 5.4.2, and on Debian's docker.io 26.1.5 with rootlesskit, installed for the check and removed after. Written as a plan on 2026-11-02, and checked against the code on 2026-11-03 after [one kind of plugin](one-kind-of-plugin.md) and the docs' move to Starlight; the same day, at the owner's word, the engine became the machine's own, podman or docker. Where the build found the plan wrong, the plan below says what was built, and [What the build changed](#what-the-build-changed) lists it.

## 0. Core or plugin

**Plugin: a plugin that other plugins build on** ([Core or plugin](../../../CONVENTIONS.md#core-or-plugin)). Many bots need no computer: chat, the library, MCP servers, and skills work without one. The core's own tools reach only its own data. A shell, a machine's files, and a browser are plugins. A bot gets a computer only while the plugin is on for it: like any plugin, it is on for every bot once added, and its **Bots** setting narrows that. An owner who never adds the plugin runs no engine, no timer, and no image.

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

### Docker, rootless

fxbot's own `setup.sh` runs the app on podman, or on docker when only docker is installed, so the computer has to run on either. This machine had podman only. What follows is from Docker's docs, moby's source, and Debian's packages, and was then checked in the build with Debian's `docker.io` 26.1.5 and `rootlesskit`, installed with the owner's go-ahead.
- **Packages.** Docker runs rootless through RootlessKit and `dockerd-rootless.sh`. Docker's own packages put them in `/usr/bin`, in `docker-ce-rootless-extras`. Debian 13's `docker.io` (26.1.5) ships the script in `/usr/share/docker.io/contrib/`, and only suggests the `rootlesskit` package (2.0.2) it needs (`dpkg -c` on both). The user also needs `uidmap` and 65,536 subordinate ids ([rootless mode](https://docs.docker.com/engine/security/rootless/)).
- **Its unit.** `dockerd-rootless-setuptool.sh install`, run as the user, writes `~/.config/systemd/user/docker.service`. The daemon reads `~/.config/docker/daemon.json`. Rootless Docker has no socket activation, so its daemon (dockerd, containerd, and RootlessKit) runs all the time, unlike podman's, which starts on a call. At rest it held 183 MB here: dockerd 89 MB, containerd 47 MB, RootlessKit 26 MB, slirp4netns 3.5 MB, and the user's systemd.
- **The socket.** By default it is `$XDG_RUNTIME_DIR/docker.sock`, and `hosts` in `daemon.json` moves it. With no socket group set, dockerd falls back to its own gid (`daemon/listeners/listeners_linux.go`), which rootless is the engine user's group. `"group": ""` in `daemon.json` counts as unset, though: the build found dockerd chowning the socket to its default `docker` group, which inside RootlessKit's namespace lands on a subordinate gid. An empty `--group=` on dockerd's command line gives the app the same access as podman's socket: the engine user's group, mode 0660.
- **Its network.** `dockerd-rootless.sh` picks slirp4netns 0.4 or newer, then pasta, then vpnkit, and passes `--disable-host-loopback` unless told otherwise. slirp4netns and pasta run as the engine user and open its connections, so the firewall by uid below covers Docker as it covers podman.
- **Limits** "are supported only when running with cgroup v2 and systemd", and on some systems "only the memory and pids controllers are delegated" ([tips](https://docs.docker.com/engine/security/rootless/tips/)). This machine delegates cpu, memory, and pids to a user's manager, and the script makes sure of all three for the engine user, whichever the engine.
- **Building.** The Engine API's `POST /build` without BuildKit uses the legacy builder, deprecated since Docker 23 and not yet removed ([deprecated features](https://docs.docker.com/engine/deprecated/)). BuildKit's build needs a session protocol over the API. Running steps in a container and committing it (`POST /commit`) works the same on both engines, with nothing deprecated.
- **Ubuntu 24.04** restricts unprivileged user namespaces through AppArmor. Its `apparmor` package carries a profile for the packaged `rootlesskit`, and a binary installed by hand needs one of its own ([troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/)). Turning the restriction off is the wrong fix.
- **The rest is the same API.** Containers with `Init`, `Memory`, `NanoCpus`, `PidsLimit`, and `ShmSize`, exec with framed output, `PUT` and `GET /archive`, volumes, labels, and `/info`, whose `SecurityOptions` lists `name=rootless` on both.

## 2. Key takeaways

1. **One computer per bot.** It costs about 2 MB while running idle and nothing when stopped. It starts in about 0.1 s, and keeps bots apart without loosening the container. Grok bot and OpenBot share a computer per person and say plainly that it isn't a boundary between bots. fxbot's bots are of one owner too, but separate computers cost nothing more here.
2. **No daemon in the computer.** The plugin uses the engine's own API for commands, files, and builds, so a computer is `sleep` under an init. That is what keeps it at 150 kB.
3. **The machine's engine, rootless, for a user of its own.** A `fxbot-computer` user runs the engine fxbot itself runs on, podman or docker, rootless. Its socket is mounted into the app with that user's group. A container escape lands in an unprivileged user that can't read fxbot's files. The app never holds a root socket, as [containers](containers.md) requires, and the plugin refuses an engine that isn't rootless. The plugin speaks the Docker API, which both engines answer, so its code doesn't change with the engine.
4. **The engine user's own systemd,** with lingering, its D-Bus session, and the cpu, memory, and pids controllers delegated, or limits are silently dropped.
5. **The internet only, by uid.** An nftables table refuses the engine user's connections to the machine, its tailnet, the LAN, and the container networks, except DNS to the machine's resolvers. It is one rule set on the host, and it covers every computer whichever way a process connects.
6. **Plugins install programs as setup steps in one image.** Each plugin that needs the computer names setup steps, as eve's extensions and Grok bot's setup scripts do. The computer runs them in a container and commits it, which both engines do the same way, into one image that every bot's computer shares, so Chromium is on disk once. A bot's own `apt-get` lasts until the image changes. Its home lasts until it is reset.
7. **Four tools, in the shape the references share:** a shell that takes one command, with a deadline and a process group; reading a file, an image included; writing one; and sharing one to the library. The shell keeps both ends of long output and the whole of it in a file, as Pi does. There are no interactive shell sessions: a server runs with `setsid`, as fx's own description says.
8. **Host setup is the plugin's, and the owner runs it once.** The plugin ships the script, and its Settings section shows the command and the script's text. The core's host command never names it. `compose.override.yaml` gives the app the socket: the host `fxbot` command already adds that file when it exists (`deploy/fxbot`), and updates and `setup.sh` leave it alone.

## 3. Implementation

### The plugins

Both live in this repository, outside the workspaces, as [plugins](plugins.md#5-open-questions) question 1 has it, and are added from fxbot's list like anyone's.

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
        { "name": "engine", "description": "The engine's socket, when it isn't where the setup script puts it" },
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

The owner runs it once, as root. The plugin's Settings section shows the exact command, from the pinned files fxbot already keeps, and the script's text under it, so the owner reads what runs as root first. In a release install the command is `sudo bash /var/lib/fxbot/data/plugins/computer/<commit>/host/setup.sh`: the app's container mounts that folder at the same path as on the machine. For a checkout, the path is under its own `FXBOT_DATA`, or in `plugins/computer/` when `FXBOT_PLUGIN_DIRS` loads it, and the command adds `--user <login>`. The script is about 140 lines and safe to run again. In order:
1. **Checks:** root, systemd, and apt (Debian 13, Ubuntu 24.04).
2. **The engine,** picked as fxbot's own `setup.sh` picks it: a release install's `FXBOT_ENGINE` from `/opt/fxbot/.env`, or else podman when it is installed, docker when only docker is, and podman, installed, when neither is. `--engine podman` or `--engine docker` picks for a checkout. The machine never gets a second engine for computers.
3. **Packages,** with `--no-install-recommends`: `uidmap dbus-user-session`, and
   - podman: `podman passt`, with podman 4.9 or newer
   - docker: `rootlesskit` beside Debian's or Ubuntu's `docker.io`, or `docker-ce-rootless-extras` beside Docker's `docker-ce`, and `slirp4netns`. A docker that is neither package, such as a snap, stops the script with what to install.
   - On Ubuntu, when `kernel.apparmor_restrict_unprivileged_userns` is 1 and no AppArmor profile in `/etc/apparmor.d` names the engine's `rootlesskit` or `podman`, the script stops and says so. It never turns the restriction off.
4. **The user:** `fxbot-computer`, a system user with its home at `/var/lib/fxbot-computer` (mode 0750), a subordinate uid and gid range of 65,536 that doesn't overlap another, and lingering on. `/etc/systemd/system/user@<its uid>.service.d/delegate.conf` delegates `cpu memory pids` to its manager, for that user only.
5. **Its engine and socket,** at `/var/lib/fxbot-computer/run/engine.sock`, mode 0660, in a folder of its own:
   - podman: a drop-in for the user's `podman.socket` listens there, enabled through the user's manager (`runuser -u fxbot-computer -- systemctl --user enable --now podman.socket`). podman starts when the socket is used, and exits 5 s after the last call.
   - docker: the script writes the user's `docker.service` as `dockerd-rootless-setuptool.sh install` would, running `dockerd-rootless.sh --group=`, and starts it through the user's manager. `~/.config/docker/daemon.json` holds `{"hosts": ["unix:///var/lib/fxbot-computer/run/engine.sock"]}`. The daemon runs all the time.
6. **The firewall,** the same for both engines:
   - `/etc/fxbot/fxbot-computer.nft` holds a table `inet fxbot_computer`. Its output chain sends the user's own packets, `meta skuid <uid>`, to a chain `computers`. A reset or an ICMP error the kernel sends back has no socket, so it passes.
   - `computers` accepts DNS (53, udp and tcp) to the nameservers in `/etc/resolv.conf` and in systemd-resolved's `/run/systemd/resolve/resolv.conf`, which rootless Docker hands its containers.
   - It refuses the machine's own addresses (`fib daddr type local`), 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10, 169.254.0.0/16, 0.0.0.0/8, and 224.0.0.0/3, and `::1`, `fc00::/7`, `fe80::/10`, and `ff00::/8` for IPv6, through a chain `refuse`: a TCP reset, so the connection fails at once, or an ICMP error.
   - `fxbot-computer-firewall.service` (oneshot, `nft -f`) loads it at boot.
7. **The app's access:**
   - **A containers install:** the script writes `/opt/fxbot/compose.override.yaml`, which mounts `/var/lib/fxbot-computer/run` at `/run/fxbot-computer` with the user's gid in `group_add`, then runs `fxbot up`. The [containers](containers.md) phase's `fxbot` command already adds that file to `COMPOSE_FILE` when it exists, and its updates and `setup.sh` leave it alone.
   - **A checkout:** `--user <login>` adds that user to the `fxbot-computer` group. The plugin finds the socket at `/var/lib/fxbot-computer/run/engine.sock` when `/run/fxbot-computer/engine.sock` isn't there, so its `engine` setting stays empty.
8. **It prints** the engine, the socket path, and what it changed.

`--name <user>` picks another user name, for checks beside a real install. `setup.sh --remove` takes it all away: it stops the user's engine and turns lingering off, then removes the user and its home (as root, which removes the computers, images, and files the subordinate ids own), the delegation drop-in, the firewall and its unit, and the override. It then runs `fxbot up`. The packages stay, since the app's engine may use them.

The folder is mounted rather than the socket file, because a socket made again by systemd would leave a mounted file pointing at the old one.

### The image

The computer makes `localhost/fxbot-computer:<12 hex of its steps' hash>` the same way on both engines, with no builder:
1. It pulls the base (`POST /images/create`), and starts a builder container from it running `sleep infinity`.
2. It puts `fxbot-run` in `/usr/local/bin` (`PUT /archive`).
3. It runs each step through exec, as root, with the network and `DEBIAN_FRONTEND=noninteractive`, and stops at the first step that fails.
4. It commits the container (`POST /commit`) with the computer's command and labels, and removes the builder.

The steps, for the computer and the browser:

```text
from  docker.io/library/debian:trixie-slim
file  fxbot-run → /usr/local/bin/fxbot-run
run   apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 procps ripgrep jq unzip xz-utils && rm -rf /var/lib/apt/lists/*
      # browser 0.1.0
run   case $(dpkg --print-architecture) in … esac && curl -fsSL -o /usr/local/bin/agent-browser …
run   apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
```

- **Each dependent's steps** follow the base's in name order, logged under the plugin's name and version. The hash covers the base, `fxbot-run`, and every step.
- **No layer cache.** A change to any step runs them all again, about 35 s with the browser here. That happens when a plugin that needs the computer is added, updated, or removed, in the background.
- **The base** is 230 MB, measured. Node isn't in it: Debian's is 20.x, and a plugin that needs Node installs the one it wants.
- **When it builds.** On a bot's first call, if the image for the current hash is missing. Again when `dependents` changes, in the background. Build lines go to the plugin's log. A failed build keeps the old image, and the error shows on the plugin's row.
- **Old images** are removed once no computer uses them.

`fxbot-run <id> <seconds> <command>` is 12 lines of bash, where `<id>` is a random id the plugin makes for the call. It runs the command with `setsid timeout -s KILL <seconds> bash -c`, writes the output to `/tmp/fxbot/<id>.log` and the process group to `/tmp/fxbot/<id>.pid`, and waits. Then it prints the whole output if it is 60 KiB or less. Otherwise it prints the first 4 KiB, a line saying how much was cut and where the rest is, and the last 56 KiB: libfx refuses a tool's result over 64 KiB as a whole, so the output stays under it. It exits with the command's code.

### Computers (`fxbot/server.ts`)

| | |
| --- | --- |
| Name | `fxbot-computer-<bot id>`, labelled `fxbot.computer=<bot id>` and `fxbot.image=<hash>` |
| Command | `sleep infinity`, with `Init: true` |
| Home | volume `fxbot-computer-<bot id>` at `/root`, where commands start |
| Limits | `Memory` and `NanoCpus` from the settings, `PidsLimit` 512, `ShmSize` 512 MiB for browsers |
| Network | the engine's rootless network, pasta on podman and slirp4netns on docker, under the firewall above. No ports published |
| Restart | none. The plugin starts it |

- **The first call** builds the image if needed, makes the volume and the container, and starts it. A later call to a stopped computer starts it (about 0.1 s). A computer on an old image is made again from the new one when it next starts; its home stays.
- **One start at a time.** Each bot has one start in flight at most, and calls in parallel wait on it. One image build runs at a time for all bots.
- **Idle stop.** A computer with no call for `idleMinutes` stops. One timer runs while any computer runs, and none runs otherwise.
- **After fxbot restarts,** the plugin lists containers by label and counts the running ones as just used.
- **A deleted bot's** computer and home are removed when the plugin loads, and whenever the idle timer stops a computer.
- **The engine check.** On load, and when the setting changes, `GET /info` and `GET /version`:
  - no answer: the Settings section shows the host command
  - no `name=rootless` in `SecurityOptions`: the plugin refuses, with "This engine runs as root. Run the computer's setup script."
  - otherwise the Settings section names the engine and its version, podman's or Docker's
- **The engine client** is Node's `http` over the socket: JSON calls, the 8-byte frames of exec output, and one-file tars. About 90 lines, with no package.

### Tools

The plugin's tools reach only the bots it is on for, named `computer_<tool>`:

| Tool | Input | Does |
| --- | --- | --- |
| `computer_shell` | `command`, `timeout` (seconds, default 120, at most 600) | Runs `fxbot-run` with an id it makes for the call. Returns `exit <code>` and the output, or "Stopped after <n> s". When the call's `signal` aborts (the turn is cancelled), a second exec kills the process group. |
| `computer_read_file` | `path`, `offset`, `limit` (lines) | Text: up to 2,000 lines or 60 KB from `offset`, as `library_read` reads, saying where it stopped. An image (PNG, JPEG, GIF, or WebP, up to 3.75 MiB) comes back as an image, so the bot sees it: a libfx `FxToolResult`, as `library_read` returns one. |
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
  - the engine's state: ready (naming podman or Docker and its version), not reachable (with the host command to copy, and **Read the script** to show its text), or refused as rootful
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
- **A bot's first call** waits for the image: the base built in 17 s here, and the browser's steps in 18 s more, measured with podman's builder; running the steps and committing should take about as long. After that, starting a computer takes about 0.1 s, and each command about 0.1 s more than the command itself.
- **Memory:** about 2 MB for each running computer at idle on podman, measured, and about 230 MB with a browser page open, measured in the build on both engines. Each computer is held to `memoryMiB`. On docker, the rootless daemon holds about 183 MB all the time, measured; each running computer's containerd shim wasn't measured apart.
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
- **Other engines,** such as nerdctl or a remote engine. The plugin would accept any rootless engine that answers the Docker API, but the script sets up only the machine's podman or docker.

### Size

About 810 lines in all, plus the two READMEs and the docs:

| Part | Lines |
| --- | --- |
| Plugin API pieces and the "Needs" lines | about 90 |
| `server.ts`: the engine client 90, computers and the image 130, tools and the skill hook 140, routes 35 | about 395 |
| `fxbot-run` | 12 |
| `page.jsx` | about 125 |
| `host/setup.sh`, with both engines | about 140 |
| The browser plugin | about 40 |

## 4. Checklist

Checks used a disposable Postgres, a mock model that makes tool calls (one, several in one reply, or a script of them), Playwright, and a mock GitHub and fxbot site, as the [plugins](plugins.md#4-checklist) checks do. With the owner's go-ahead, `setup.sh` ran here as `--name fxbot-computer-check`, first on podman, then on rootless Docker from Debian's `docker.io` and `rootlesskit`, installed with the system daemon kept off; `--remove` and `apt-get purge` took it all away after. The release install on this machine was left alone.

**M1. The plugin API pieces**
- [x] A plugin that needs another: its page says "Needs base, which isn't added yet", **Add** is off, and the API refuses it with "Add base first." Removing the needed plugin is refused with "user needs base. Remove it first."
- [x] A bot that has the dependent on and the needed one off shows "Needs base on this bot" in its switches, and doesn't once it's on.
- [x] `fx.dependents()` returns the dependent's block, and `fx.on("dependents")` fires on add, update, and removal. Local plugins listed dependent first still load the needed one first.
- [x] `fx.library.read` refuses an item that isn't tagged for the bot. `fx.library.save` puts an image in the bot's library, tagged for the chat, and refuses bytes that aren't the image they claim.
- [x] `fx.skills.files(bot, name)` returns the skill's files. A plugin with no code parts adds, and its skill joins the catalog.

**M2. The engine**, on podman and on docker
- [x] `setup.sh` takes podman when it's installed and `--engine docker` when asked. Not run here: a machine with neither engine, or with a docker that isn't `docker.io` or `docker-ce`.
- [x] It makes the user, its subordinate range, lingering, the delegation drop-in, the socket with mode 0660 and the user's group, the firewall, and its unit; a second run writes the same files; `--remove` takes them all away, the user's group included.
- [x] A check release install, under its own `FXBOT_ROOT`, project, and port, running an image built from this branch: the script wrote its `compose.override.yaml` and ran `fxbot up`, and the app's container had the socket folder and group 986. After `fxbot down` and `fxbot up` it still had them, and `--remove` took them away. An update wasn't run: it replaces `compose.yaml`, `fxbot`, the GPU file, and `.env`, never the override, and every start passes through `compose()`, which adds it.
- [x] From that container, the plugin reached rootless Docker and built the image; from a checkout, both engines. Root's podman socket in the setting is refused: "This engine runs as root. Run the computer's setup script."
- [x] Settings shows the command, `sudo bash /var/lib/fxbot/data/local/computer/host/setup.sh` in the container and `… --user root` in the checkout, and **Read the script** shows `setup.sh`.
- [x] `memory.max`, `pids.max`, and `cpu.max` are 2147483648, 512, and 200000 100000, on each engine.
- [x] Docker's daemon at rest: 183 MB. A computer's containerd shim wasn't measured apart.

**M3. Computers**, on podman and on docker
- [x] A bot's first `computer_shell` builds the image, shows the build in Settings, and answers: 17 s for the base on podman, 55 s with the browser on docker. A second bot's computer doesn't see the first's files or processes.
- [x] After `idleMinutes` (1), a computer stops, 80 to 85 s on; its next call starts the same container, with `/root` and a file outside it.
- [x] A plugin that needs the computer, added or removed, makes the image again in the background; a running computer stays on its image until it stops, then moves, keeping `/root` and losing a file outside it.
- [x] The old image is removed once no computer uses it.
- [x] After fxbot restarts, running computers count as just used, and stop on time. A deleted bot's computer and home go when the plugin loads.
- [x] **Stop**, **Reset**, and **Delete all computers** work from the page.
- [x] With no computer running, no timer runs and no call reaches the engine: podman's service goes inactive. (Docker's daemon runs anyway.)
- [x] Three `computer_read_file` calls in one reply, to a stopped computer, start it once.

**M4. Tools**, through the mock model, on podman and on docker
- [x] `computer_shell` returns `exit 3`, `hi`, and `err` for `echo hi; echo err >&2; exit 3`, and stops `sleep 999` with `timeout: 2` after 2 s.
- [x] For 2 MB of output, the model gets the first 4 KiB, the line naming the log, and the last 56 KiB, 61,549 bytes in all, and the log holds the 2,000,000. The first build kept 60 KiB of the end, and libfx refused the result as over its 64 KiB.
- [x] The cancel path: killing a command's process group from its pid file leaves no process. fxbot has no way to cancel a running turn, so the tool's `signal` was checked by this path, not by a cancelled turn.
- [x] A `setsid` server started by one call answers a `curl` in the next.
- [x] `computer_read_file` pages a 5,000-line file 2,000 lines at a time and by `offset`, and returns a PNG as an image, which reaches the model's request.
- [x] `computer_write_file` writes text into a new folder, and a library image's bytes.
- [x] `computer_to_library` puts a PNG in the bot's library, and refuses a binary.
- [x] A bot with no computer reads a skill with a script: the hook returns in 20 ms, the script is in `/skills/runner/` by its first call, executable, and runs.

**M5. What a computer reaches**, on podman and on docker
- [x] The internet (HTTPS to example.com) and DNS work.
- [x] Refused at once: fxbot's port, the machine's tailnet address on 443 and 4173, the database container, the LAN's router, the machine's LAN address, `host.containers.internal`, and 169.254.169.254. With the firewall stopped, the tailnet address, the database container, and the host's SSH answered.
- [x] The rules hold after `systemctl restart fxbot-computer-check-firewall`.

**M6. The browser**
- [x] The steps build on amd64, in 44 s on podman, into a 959 MB image. arm64 wasn't built: this machine has no emulation for it.
- [x] On each engine, a scripted turn opened example.com, read its refs, took a screenshot, and saw it as an image. The computer held about 230 MB with the page open, and 11 to 16 MB after closing it.

**M7. Docs and checks**
- [x] The docs have [Give bots a computer](https://fxbot.sh/docs/how-to/give-bots-a-computer/) and [The computer](https://fxbot.sh/docs/reference/computer/), and "Add a plugin" has a plugin that needs another. The SDK's Plugin API reference and "Write a plugin" cover `needs`, `fx.dependents()`, the `dependents` event, `fx.library`, `fx.skills.files`, image results, and the 64 KiB limit.
- [x] fxbot's `plugins-registry.json` lists the computer and the browser.
- [x] `CHANGELOG.md` has the computer, the browser, and plugins that need others.
- [x] The computer's `page.js` is built from `page.jsx`.
- [x] `npm run typecheck`, `npm run build`, `npm run build-site`, `git diff --check`, and `bash -n` pass. `shellcheck` isn't installed here.

**The human runs these:**
- On their own install: add the computer, run the command it shows, and narrow its **Bots** to one bot. Ask the bot to make a chart with Python and share it, then check it in the library.
- Add the browser, and ask the bot to look something up on a site and send a screenshot.
- From a computer, check that fxbot's tailnet address doesn't answer.
- On a docker machine, best Ubuntu 24.04 with Docker's own packages, run the script and ask a bot for `uname -a`.
- On an arm64 machine, add the browser and open a page.

## What the build changed

- **libfx's 64 KiB.** libfx refuses a tool's result over 64 KiB, as a whole. Long output keeps 4 KiB and 56 KiB, not 60, and text is read 60 KB at a time, not 256 KiB.
- **Docker's socket group** is set with `--group=` on the command line, since an empty one in `daemon.json` counts as unset; the script writes the user's unit itself.
- **The firewall** matches the user's own packets and jumps to its rules, which refuse with a TCP reset: matched as "not the user", a reset the kernel sends back has no socket and was caught too, and every refused connection waited out its timeout. Its DNS exception covers systemd-resolved's upstream resolvers, which rootless Docker's containers ask.
- **The socket** has no default in the setting: the plugin looks in the container's path, then the checkout's.
- **A plugin at a repository's root** couldn't be added: an empty folder was read as a path outside it. Fixed in the SDK.
- **Cancelling a turn** isn't something fxbot does, so the shell's cancel path is there for when it does.
- **The log** gets each computer's start and each build step.

## 5. Open questions

Each has a default that the build follows unless the owner changes it.

1. **One computer per bot, or one for all.** *Default:* one per bot. A running computer costs about 2 MB at idle, and a stopped one costs only its disk. Bots' files and processes stay apart, and programs are on disk once in the shared image. One for all would save nothing measurable here.
2. **The engine.** *Settled by the owner on 2026-11-03:* the machine's own, podman or docker, picked as fxbot's `setup.sh` picks it, and run rootless for a `fxbot-computer` user by the plugin's script, on Debian 13 and Ubuntu 24.04. A docker machine runs the rootless daemon all the time, since rootless Docker has no socket activation; podman's starts on a call. The ways not taken are a second engine beside docker, a service that holds the root socket and checks every request, as OpenBot's supervisor does, and nested podman, which needs a loosened or privileged container.
3. **What a computer reaches.** *Default:* the internet only. An owner who wants a computer to reach a LAN service edits `/etc/fxbot/computer.nft` to accept it. A setting for this would need a request to the host.
4. **Sizes.** *Default:* 2 GiB of memory, 2 CPUs, 512 processes, and a stop after 15 idle minutes, in the plugin's settings, with commands at 120 s unless the bot asks for up to 600 s. OpenBot uses the same command limits, and openmuse stops its desktop after 15 idle minutes.
5. **Root in the computer.** *Default:* the bot is root there, which is the unprivileged engine user on the machine, so `apt-get` works with no sudo. The other way is a user inside the computer with sudo for apt only, as OpenBot's all-in-one image has.
6. **Removing the plugin.** *Default:* computers and homes stay until **Delete all computers** or `setup.sh --remove`, because a plugin's cleanup also runs on updates. The plugin's Settings section says so beside **Delete all computers**.
7. **Later phases.** *Default:* local MCP servers and a desktop with computer use get stubs of their own in `docs/phases/`, each planned when the owner asks.
