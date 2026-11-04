# The computer on Add

Adding the computer plugin is all an owner does. Today, Settings then shows a command to run on the machine as root, which makes the engine's user, its rootless podman or docker, and its firewall. With this phase, the machine does that by itself when the plugin is added, and Settings says so while it works.

Status: built on 2026-11-04, for 0.4.0, at the owner's word; the owner chose that the setup starts on **Add**, not on a button. Checked on this machine in a release install made for the check, beside the owner's real one, and on the owner's own dev install.

## Core or plugin

Both, kept small:
- **Core**, one hook: a plugin can ask the machine for a job the machine knows, and read how it went, through the request folder Settings' Update and the embedder switch already use. The only such job is `computer`.
- **The machine's `fxbot` command** gains `fxbot computer on|off`. It runs the computer's setup script, fetched at the running release's tag, as root.
- **The plugin** asks for the job when it finds no engine, and shows its progress.

## How it works

**In a release install:**
1. The owner adds the computer. Its code loads, finds no engine at `/run/fxbot-computer/engine.sock`, and calls `fx.machine.ask("computer")`.
2. fxbot writes `computer.json` into its request folder. systemd runs `fxbot apply`, as for an update.
3. `fxbot computer on` downloads `plugins/computer/host/setup.sh` at `v<FXBOT_VERSION>` from where the release's own files come from, into `/opt/fxbot`, and runs it. It writes `computer-status.json`: working, done, or failed with the script's last lines.
4. The script does what it does today: the user, the engine, the firewall, and `compose.override.yaml`, then `fxbot up`, which starts fxbot's container again with the engine's socket.
5. The plugin loads again, finds the engine, and works.

**The machine runs only fxbot's own files.** A request names a job; it never carries a command or a script. The script comes from the release's tag, not from the plugin's folder, which the app can write. Any plugin with code could ask for the `computer` job, and that is all it could ask for: a rootless user, kept to the internet. A plugin with code already holds everything fxbot holds.

**In a checkout:** there is no request folder.
- Run as root, as an owner's checkout often is, the plugin runs its own `host/setup.sh --user root` when it finds no engine.
- Run as another user, nothing there can act as root, so Settings shows the command, as today.

**When it fails,** the plugin doesn't ask again by itself: Settings shows why, and **Try again**. A plugin that finds the engine gone later, such as after `fxbot computer off`, asks again on its next start.

**Removing the plugin** keeps the engine, as it keeps the computers. `sudo fxbot computer off` removes the engine, its user, its computers, and the firewall.

## What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk` | `FxbotOptions.machine`, and `PluginApi.machine`: `ask(job)` and `status(job)`, or `null` with no machine | about 25 |
| `packages/server/src/control.ts` | `computer.json` and `computer-status.json`, for the `computer` job only | about 25 |
| `deploy/fxbot` | `fxbot computer on\|off`, and `computer.json` in `apply` | about 45 |
| `plugins/computer` | ask on load, run the script itself as root in a checkout, Settings' states and **Try again** | about 70 |
| Docs | Give bots a computer, The computer, the Plugin API, the changelog | about 40 |

`FXBOT_COMPUTER_NAME` names the user, `fxbot-computer` unless set, so a check runs beside a real install.

## Checklist

- [x] In a check release install (its own `COMPOSE_PROJECT_NAME`, `FXBOT_PORT`, and `FXBOT_ROOT`, on an image of 0.4.0 built here, with the release's files served from this machine), adding the computer sets up the engine with no command: the request, `fxbot apply` run by hand in systemd's place, the script from the release's files, the override, the restart in 5 s, and a computer that runs. It shared the `fxbot-computer` engine the owner's dev install had set up, and each listed only its own computers.
- [ ] Settings shows the setup while it works, and a failure's reason with **Try again**, which asks again. Half done: the status said `asked`, then `done`, and a failed download wrote `failed` with its reason. The page's **Try again** wasn't clicked.
- [x] A request for another job, or a body that isn't `on` or `off`, does nothing. So does `off`, which only the owner runs.
- [ ] A checkout run as root sets up by itself; one run as another user shows the command. Half done: the owner's dev install, a checkout run as root with the plugin from `FXBOT_PLUGIN_DIRS`, set itself up when the API restarted onto this change, and a bot's computer started on the new engine.
- [ ] `sudo fxbot computer off` takes it all away, and the release runs on without the override. Not run: the check shared the owner's engine, which `off` would have removed. It runs the setup script's `--remove`, which the v2 checks ran.
- [x] Typecheck, build, build-site, `bash -n`, and `git diff --check` pass.

## Open questions

1. **When it asks.** *Settled by the owner:* on **Add**, with no button.
2. **Where the script comes from.** *Default:* the release's tag, downloaded on the job, so it's always the release's own and needs nothing at install or update. Shipping it in `/opt/fxbot` with each update is the other way.
3. **Off.** *Default:* a command only. The plugin has no hook for its removal, and a plugin's cleanup also runs on updates.
