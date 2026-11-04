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

The Computer screen, at `/computer/computers/<key>`, shows a computer's desktop live, through noVNC, and its terminal, through xterm.js, over the plugin's WebSockets. A bot's key is its id, and `/computer/bots/<id>`, from before 0.3.0, opens the same screen. **Take over** gives you the mouse and keyboard; the bot's desktop and terminal tools wait until you **Hand back**. Over the desktop, an arrow in each bot's colour shows where it last pointed, with what it did; the newest is solid.

A computer starts on its bot's first call and stops when it sits idle, unless someone watches it. Its home, `/root`, is kept, with the browser's profile; programs the bot installs last until the computer is made again from a new image. When a bot reads a skill that has scripts, they're copied to `/skills/<name>` on its computer.

Plugins that need the computer add programs to every computer with setup steps, in `needs.computer.setup` in their `plugin.json`.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it. Like every plugin, it's on for every bot once added; choose its bots in its settings.

## Computers for other plugins

Since 0.3.0, a plugin that needs the computer can name computers of its own, such as [chat-rooms-computer](../chat-rooms-computer/)'s, one for each room. It provides, with `fx.provide`:

```ts
type ComputerProvider = {
  /** The computer for a chat, or null for the bot's own. `name` makes its hostname: `<name>-computer`. */
  computerFor(call: { bot: string; session: string }): Promise<{ key: string; name: string } | null>;
  /** Every computer it keeps, with its name; null while it can't tell. */
  computers(): Promise<{ key: string; name: string }[] | null>;
};
```

- A key is a word, a dash, and more, such as `room-1a2b3c4d`, which a bot's id never is. Its container and home are `fxbot-computer-<key>`, labelled `fxbot.by=<plugin>`.
- Each call asks the plugins that provide one, in turn, which computer the chat uses; otherwise it's the bot's own.
- A plugin's computer goes when the plugin is removed, or runs and doesn't list it. One added but not running, or that answers null, keeps its own.
- On a shared computer, a `computer_desktop` result says where the other bots last pointed, **Take over** pauses every bot's desktop and terminal tools, and **Hand back** sends nothing: the owner tells the bot to go on.
- The page's routes are under `computers/<key>/`: `state`, `cursors`, `start`, `stop`, `reset`, and `takeover`.

## Set up the engine

Computers run in this machine's own container engine, podman or docker, whichever fxbot runs on, started rootless for a user of its own. When the plugin finds no engine, the machine sets it up by itself, with `host/setup.sh`:
- in a release install, the machine's `fxbot` command runs it, as `fxbot computer on`, from the release's own files, then starts fxbot again
- in a checkout run as root, the plugin runs it
- in a checkout run as another user, the plugin's section in **Settings** shows the command to run as root

`host/setup.sh`:
- installs what the engine needs to run rootless: `uidmap`, `dbus-user-session`, and `nftables`, with `podman` and `passt`, or `rootlesskit` (or Docker's `docker-ce-rootless-extras`) and `slirp4netns`
- makes the user `fxbot-computer`, with lingering, and delegates cpu, memory, and pids to it, so limits hold
- puts the engine's socket in `/var/lib/fxbot-computer/run/`
- loads a firewall, `/etc/fxbot/fxbot-computer.nft`, that lets the user's connections reach the internet and DNS, and not this machine, its tailnet, or its networks
- in a release install, writes `/opt/fxbot/compose.override.yaml`, which gives fxbot's container the socket's folder and the user's group

In a checkout, add `--user <login>` for the login that runs fxbot. `--remove` takes it all away, as `sudo fxbot computer off` does in a release install. It's safe to run again.

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
| `fxbot/migrations/` | Its table: this install's id, which labels its computers, homes, and images |
| `fxbot/session` | Copied into the image: the computer's command, which starts its desktop |
| `fxbot/fxbot-run` | Copied into the image: runs one command, with its deadline and process group |
| `fxbot/fxbot-screen` | Copied into the image: one action on the desktop, then a screenshot |
| `fxbot/agent-browser` | Copied into the image: starts the desktop's Chromium, then runs agent-browser on it |
| `fxbot/page.jsx` | The Computer screen, its sections in Settings and in each bot's settings, the view of `computer_desktop` calls, and the screen button |
| `fxbot/page.js` | `page.jsx`, built |
| `fxbot/novnc.js` | noVNC 1.7.0, built as one module, which the page loads from a route |
| `fxbot/page.css` | xterm.js's CSS |
| `fxbot/page-licenses.txt` | The licenses of what `page.js`, `page.css`, and `novnc.js` bundle: xterm.js, MIT, and noVNC 1.7.0, MPL-2.0, with where its source is |
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

When the bundled packages change, write `fxbot/page-licenses.txt` again from their license files.
