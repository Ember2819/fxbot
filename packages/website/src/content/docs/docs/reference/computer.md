---
title: "The computer"
description: "The computer plugin's tools, skills, desktop, settings, setup, and image, and what a computer reaches."
---

The computer plugin's tools, skills, desktop, settings, setup, and image, and what a computer reaches. To add it, see [Give bots a computer](/docs/how-to/give-bots-a-computer/).

## Tools

Bots the plugin is on for get seven tools. A relative path starts at `/root`.

| Tool | Input | What it does |
| --- | --- | --- |
| `computer_shell` | `command`, and `timeout` in seconds: 120 unless given, 600 at most | Runs one bash command in a new shell in `/root`, and answers `exit <code>` and its output. A command still running at its timeout is stopped, with its process group, and the output says so. It reaches the desktop, so `agent-browser` and `agent-desktop` work from it. |
| `computer_terminal` | `text`, typed as is; `keys`, named, such as `Enter`, `Tab`, `Escape`, `Up`, or `C-c`; `wait`, in seconds: 1 unless given, 30 at most | Sends them to the terminal, the tmux session `main`, waits, and answers its last 200 lines. For a program that asks and waits: a REPL, an installer's prompts, `ssh`, `top` |
| `computer_desktop` | `action`, and what it needs, below | One action on the screen, then a screenshot |
| `computer_read_file` | `path`, `offset` (the first line, from 1), `limit` (lines, up to 2,000) | Text, 2,000 lines or 60 KB at a time, saying where the next part starts. An image (PNG, JPEG, GIF, or WebP, up to 3.75 MiB) comes back as an image, which the bot sees. |
| `computer_write_file` | `path`, and `text` (up to 1 MiB) or `library` (a `library:<id>`); or `old_text` and `new_text` | Writes the text, or the library item's bytes, making the folders it needs. With `old_text`, which must be in the file exactly once, changes that one place to `new_text`. Either way, a file that was there keeps its mode. |
| `computer_to_library` | `path`, and `name` | Saves an image (up to 3.75 MiB) or a text file (up to 1 MiB) to the bot's library, tagged for the chat, and answers its `library:<id>` |
| `computer_ask_owner` | `reason`, in one line | Hands the desktop to the owner for a step only they can do, as **Take over** does, and shows them the reason |

`computer_desktop`'s actions, in the screenshot's own pixels:

| `action` | Needs |
| --- | --- |
| `screenshot`, `cursor_position` | Nothing |
| `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click` | `coordinate`, `[x, y]`, or the cursor where it is; `text` for keys held during the click, such as `shift` or `ctrl+shift` |
| `mouse_move` | `coordinate` |
| `left_click_drag` | `start_coordinate` and `coordinate` |
| `scroll` | `scroll_direction`, `up`, `down`, `left`, or `right`; `scroll_amount`, 3 unless given; `coordinate` |
| `type` | `text` |
| `key` | `text`, a key or combination, such as `Return` or `ctrl+l` |
| `wait` | `duration` in seconds, 1 unless given, 30 at most |
| `zoom` | `region`, `[x1, y1, x2, y2]`: that part of the screen at its own size |

Each answer says what it did, the screen's size, the active window's title, and the cursor, with the screenshot, a PNG, or a JPEG when a PNG would be over 3.75 MiB. `screenshot: false` leaves out the image. A model that can't see images gets the text, and libfx's note that the image wasn't sent. In a reply, a `computer_desktop` call shows its screenshot; fxbot keeps each bot's last 50 in memory, so a reply from before fxbot restarted shows its text only.

While the owner has a computer, after **Take over** or `computer_ask_owner`, `computer_desktop` and `computer_terminal` answer that the owner has it. The shell and file tools go on. When the owner hands back after the bot asked, the bot's chat gets a message from the computer, and the bot's turn starts again.

- **Long output.** Output over 60 KiB comes back as its first 4 KiB and last 56 KiB, with a line saying how much was cut, and where the whole of it is, in `/tmp/fxbot/`. A tool's result can be at most 64 KiB.
- **Servers.** A command started with `setsid cmd > log 2>&1 &` keeps running after its call, until the computer stops.
- **Calls at once.** Shell commands run one at a time. Reads and writes in one reply run together.
- **Skills.** When a bot reads a skill with files besides `SKILL.md`, its files are copied to `/skills/<name>/` on the bot's computer before its next call, and the skill's text says so.

## Skills and instructions

Each chat of a bot the computer is on for has a few lines in its instructions: which part of the computer to use for what, cheapest first, and to ask the owner before it sends, buys, signs in, or deletes. Other bots' chats have none.

The plugin has three skills:

| Skill | What it covers |
| --- | --- |
| `computer` | Which tool for which job, and how to act on a screen and check what happened. `$computer` in a message, or the screen button beside the message box, sends it with the message. |
| `browser` | Web pages with `agent-browser`. It has the bot run `agent-browser skills get core`, the text that comes with the version on the computer. |
| `desktop` | Desktop apps with `agent-desktop`, by their accessibility trees. It has the bot run `agent-desktop skills get desktop`. |

## The desktop

Each computer is named for its bot, as its hostname, such as `bob-computer`, and runs a desktop: XFCE on an X display, `:1`, with a panel, the Thunar file manager, Chromium, and a terminal window on the tmux session `main`. Its VNC server listens on a unix socket in the computer, `/tmp/fxbot/vnc.sock`, and no computer listens on a TCP port.

- **The Computer screen**, `/computer/bots/<id>`, shows the desktop through [noVNC](https://novnc.com) and the terminal through [xterm.js](https://xtermjs.org), over WebSockets at `/api/plugins/computer/desktop/<id>` and `/api/plugins/computer/terminal/<id>`. The desktop is view-only until **Take over**; the terminal takes typing always. For a stopped computer, the screen has **Start it**.
- **The browser** is Chromium, run as root without its sandbox, with its profile in `/root/.config/chromium`, so sign-ins last. The `agent-browser` command starts it on the desktop when it isn't running, brings its window to the front, and drives it over DevTools on `127.0.0.1:9222`, inside the computer.
- **Accessibility** is on for every app, so `agent-desktop` reads their trees.
- **Fonts** are DejaVu and Noto, which cover most scripts, but not Chinese, Japanese, Korean, or color emoji.

## Settings

In the plugin's settings in **Plugins**:

| Setting | Default | What it is |
| --- | --- | --- |
| `engine` | `/run/fxbot-computer/engine.sock`, then `/var/lib/fxbot-computer/run/engine.sock` | The engine's socket |
| `memoryMiB` | 2048 | Memory for each computer, in MiB |
| `cpus` | 2 | CPUs for each computer |
| `idleMinutes` | 15 | Minutes without a call before a computer stops. One someone watches doesn't stop. |
| `screen` | `1280x800` | The desktop's size, width x height in pixels |

Each computer also has at most 512 processes, and 512 MiB of shared memory for browsers. A computer made with other sizes, or another screen, is made again with the new ones when it next starts; its home stays.

## The setup

The computer's engine is set up by `host/setup.sh`, in the plugin's files, run as root. When the plugin loads and finds no engine, it has the script run, once each time fxbot starts:

| fxbot runs | Who runs the script |
| --- | --- |
| From a release install | The machine's `fxbot` command, with `fxbot computer on`, which the plugin asks for through fxbot's requests. It runs the script from the release's own files, not the plugin's folder, then starts fxbot again. |
| From a checkout, as root | The plugin, with `--user root` |
| From a checkout, as another user | Nobody: **Settings** › **Computer** shows the command, to run as root |

**Settings** › **Computer** shows the setup while it works, and why it failed, with **Try again**. `FXBOT_COMPUTER_NAME` names another user than `fxbot-computer`, for checks beside a real install.

The script's options, for running it by hand:

| Option | What it does |
| --- | --- |
| none | A release install in `/opt/fxbot`: the engine it uses, and `compose.override.yaml`, which gives fxbot's container the socket's folder and the user's group |
| `--user <login>` | A checkout: `<login>` joins the user's group, to reach the socket |
| `--engine podman` or `--engine docker` | A checkout's engine. Otherwise podman when it's installed, or docker when only docker is |
| `--name <user>` | Another user than `fxbot-computer` |
| `--install <folder>` | Another release install than `/opt/fxbot` |
| `--remove` | Takes it all away: the user, its computers and files, the firewall, and the override. The packages stay. |

What it sets up:

| Thing | Where |
| --- | --- |
| Packages | `uidmap`, `dbus-user-session`, `nftables`, and `curl`; with podman, `podman` and `passt`; with docker, `rootlesskit` beside Debian's or Ubuntu's `docker.io`, or `docker-ce-rootless-extras` beside Docker's `docker-ce`, and `slirp4netns` |
| The user | `fxbot-computer`, home `/var/lib/fxbot-computer`, 65,536 subordinate ids, lingering on |
| Limits | `/etc/systemd/system/user@<uid>.service.d/fxbot-computer.conf` delegates cpu, memory, and pids to it |
| The engine | Its socket at `/var/lib/fxbot-computer/run/engine.sock`. Podman starts when called and stops 5 seconds after; Docker's rootless daemon runs all the time, and holds about 180 MB. |
| The firewall | `/etc/fxbot/fxbot-computer.nft`, loaded at boot by `fxbot-computer-firewall.service` |

## What a computer reaches

The firewall matches the connections of the user `fxbot-computer`, which are every connection its computers make.

| Reached | Refused |
| --- | --- |
| The internet | This machine, at any of its addresses |
| DNS, through the machine's resolvers | Its tailnet, `100.64.0.0/10` and `fc00::/7` |
| | Private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, and `fe80::/10` |
| | Loopback, multicast, and fxbot's containers |

A refused connection fails at once. To let a computer reach one address on your network, add a rule before the others in the `computers` chain of `/etc/fxbot/fxbot-computer.nft`, such as `ip daddr 192.168.1.20 tcp dport 8080 accept`, then run `sudo systemctl restart fxbot-computer-firewall`.

## The image

Every computer runs from one image, `localhost/fxbot-computer:<install>-<hash>`, about 1.2 GB, made from Debian 13 slim with:

- `ca-certificates curl git python3 procps ripgrep jq unzip xz-utils`
- the desktop: TigerVNC's `Xvnc`, XFCE, Thunar, `xfce4-terminal`, `tmux`, `xdotool`, `scrot`, and the accessibility bus
- `chromium`, and fonts: DejaVu and Noto
- [agent-desktop](https://github.com/vercel-labs/agent-desktop) 1.1.0 and [agent-browser](https://github.com/vercel-labs/agent-browser) 0.41.1, each checked against its SHA-256

A running computer holds about 120 MB at idle, and about 330 MB with a page open in Chromium.

**Two fxbots on one machine,** such as a checkout beside a release, share the engine. Each labels the computers, homes, and images it makes with an id of its own, kept in the plugin's table, and lists, stops, deletes, and prunes only its own. A computer another fxbot made for a bot is left alone, and a call for it says so.

A plugin that needs the computer adds setup steps, which run as root with the network, in name order, after the computer's own. The computer's files go in last, so a step can't replace them. The image is made again in the background when such a plugin is added, updated, or removed; a running computer moves to it the next time it starts. An image no computer uses is removed.
