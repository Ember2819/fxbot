# computer

A plugin for [fxbot](https://fxbot.sh): each bot gets a Linux computer of its own, a Debian machine where it is root, with a desktop you watch and take over, a terminal, Chromium, and files that last.

- `computer_shell` runs one bash command, with a deadline, and keeps both ends of long output. `agent-browser` drives Chromium from it, and `agent-desktop` reads and drives desktop apps by their accessibility trees.
- `computer_terminal` types into the terminal, the tmux session `main`, and reads its screen, for programs that ask and wait.
- `computer_desktop` clicks, types, scrolls, and drags by the screen's pixels, then takes a screenshot.
- `computer_read_file` reads text a page at a time, or an image, which the bot sees.
- `computer_write_file` writes text, or a library item's bytes, or changes one place in a file.
- `computer_to_library` saves an image or a text file to the bot's library, where you see it.
- `computer_ask_owner` hands you the desktop for a step only you can do, such as a sign-in.

Its three skills, `computer`, `browser`, and `desktop`, say which part to use for what, and a few lines in each chat's instructions say it for bots that read none. `$computer` in a message, or the screen button beside the message box, sends the `computer` skill with it.

The Computer screen, at `/computer/bots/<id>`, shows a bot's desktop live, through noVNC, and its terminal, through xterm.js, over the plugin's WebSockets. **Take over** gives you the mouse and keyboard; the bot's desktop and terminal tools wait until you **Hand back**.

A computer starts on its bot's first call and stops when it sits idle, unless someone watches it. Its home, `/root`, is kept, with the browser's profile; programs the bot installs last until the computer is made again from a new image. When a bot reads a skill that has scripts, they're copied to `/skills/<name>` on its computer.

Plugins that need the computer add programs to every computer with setup steps, in `needs.computer.setup` in their `plugin.json`.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. Like every plugin, it's on for every bot once added; choose its bots in its settings.

## Set up the engine

Computers run in this machine's own container engine, podman or docker, whichever fxbot runs on, started rootless for a user of its own. The plugin's section in **Settings** shows the command to run, once, as root, and the script it runs:

```sh
sudo bash /var/lib/fxbot/data/plugins/computer/<commit>/host/setup.sh
```

`host/setup.sh`:
- installs what the engine needs to run rootless: `uidmap`, `dbus-user-session`, and `nftables`, with `podman` and `passt`, or `rootlesskit` (or Docker's `docker-ce-rootless-extras`) and `slirp4netns`
- makes the user `fxbot-computer`, with lingering, and delegates cpu, memory, and pids to it, so limits hold
- puts the engine's socket in `/var/lib/fxbot-computer/run/`
- loads a firewall, `/etc/fxbot/fxbot-computer.nft`, that lets the user's connections reach the internet and DNS, and not this machine, its tailnet, or its networks
- in a release install, writes `/opt/fxbot/compose.override.yaml`, which gives fxbot's container the socket's folder and the user's group

In a checkout, add `--user <login>` for the login that runs fxbot. `--remove` takes it all away. It's safe to run again.

## Settings

| Setting | Default | What it is |
| --- | --- | --- |
| `engine` | where the script puts it | The engine's socket |
| `memoryMiB` | 2048 | Memory for each computer |
| `cpus` | 2 | CPUs for each computer |
| `idleMinutes` | 15 | Minutes without a call before a computer stops |
| `screen` | `1280x800` | The desktop's size |

A computer made before a change to its sizes or its screen is made again with the new ones when it next starts, keeping its home.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, version, parts, and settings |
| `package.json` | What the page is built from, noVNC and xterm.js, and `"type": "module"` for the server code |
| `fxbot/server.ts` | The engine client, the image, computers, the tools, the routes, the sockets, and the instructions entry |
| `fxbot/session` | Copied into the image: the computer's command, which starts its desktop |
| `fxbot/fxbot-run` | Copied into the image: runs one command, with its deadline and process group |
| `fxbot/fxbot-screen` | Copied into the image: one action on the desktop, then a screenshot |
| `fxbot/agent-browser` | Copied into the image: starts the desktop's Chromium, then runs agent-browser on it |
| `fxbot/page.jsx` | The Computer screen, its sections in Settings and in each bot's settings, the view of `computer_desktop` calls, and the screen button |
| `fxbot/page.js` | `page.jsx`, built |
| `fxbot/novnc.js` | noVNC 1.7.0, built as one module, which the page loads from a route |
| `fxbot/page.css` | xterm.js's CSS |
| `skills/` | The `computer`, `browser`, and `desktop` skills |
| `host/setup.sh` | The engine, set up once on the machine |

## Build the page

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages, and `novnc.js` is noVNC's `RFB` as one ES module. Run these in this folder, in a checkout of fxbot, after changing `page.jsx` or `package.json`:

```sh
npm install
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
npx rolldown node_modules/@novnc/novnc/core/rfb.js --format esm --file fxbot/novnc.js
cp node_modules/@xterm/xterm/css/xterm.css fxbot/page.css
```
