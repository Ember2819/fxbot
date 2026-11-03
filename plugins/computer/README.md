# computer

A plugin for [fxbot](https://fxbot.sh): each bot gets a Linux computer of its own, a Debian machine where it is root, with files that last and the programs other plugins install.

- `computer_shell` runs one bash command, with a deadline, and keeps both ends of long output.
- `computer_read_file` reads text a page at a time, or an image, which the bot sees.
- `computer_write_file` writes text, or a library item's bytes.
- `computer_to_library` saves an image or a text file to the bot's library, where you see it.

A computer starts on its bot's first call and stops when it sits idle. Its home, `/root`, is kept; programs the bot installs last until the computer is made again from a new image. When a bot reads a skill that has scripts, they're copied to `/skills/<name>` on its computer.

Plugins that need the computer add programs to every computer with setup steps, as the [browser](../browser) does.

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

A computer made before a change to its sizes is made again with the new ones when it next starts, keeping its home.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, version, parts, and settings |
| `fxbot/server.ts` | The engine client, the image, computers, the tools, and the routes |
| `fxbot/fxbot-run` | Copied into the image: runs one command, with its deadline and process group |
| `fxbot/page.jsx` | Its sections in Settings and in each bot's settings |
| `fxbot/page.js` | `page.jsx`, built |
| `host/setup.sh` | The engine, set up once on the machine |

## Build the page

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. Run this in this folder, in a checkout of fxbot, after changing `page.jsx`:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
