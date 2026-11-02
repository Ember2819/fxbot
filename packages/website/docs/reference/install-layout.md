# What setup.sh creates

An install made by [`setup.sh`](/docs/reference/commands/#setupsh), on Debian or Ubuntu.

## Files and folders

| Path | What it is | Owner, mode |
| --- | --- | --- |
| `/opt/fxbot/repo/` | A clone of the repository, for fetching tags | `fxbot` |
| `/opt/fxbot/releases/<tag>/` | Each installed release: a git worktree at its tag, with its packages and its build. An update keeps the new release and the one it replaced. | `fxbot` |
| `/opt/fxbot/current` | A link to the running release, such as `releases/v0.1.0` | `fxbot` |
| `/opt/fxbot/update.lock` | Present while an update runs | `fxbot` |
| `/etc/fxbot/` | The settings and the key | `fxbot`, 700 |
| `/etc/fxbot/secret.key` | 32 random bytes in base64, which seal every stored secret | `fxbot`, 400 |
| `/etc/fxbot/fxbot.env` | The service's [settings](/docs/reference/configuration/) | `fxbot`, 600 |
| `/var/lib/fxbot/` | The `fxbot` user's home | `fxbot`, 700 |
| `/var/lib/fxbot/data/` | libfx's session files for each chat (`FXBOT_DATA`) | `fxbot`, 700 |
| `/var/lib/fxbot/backups/` | Backups taken before migrations change a database in use, the last five (`FXBOT_BACKUPS`) | `fxbot`, 700 |
| `/etc/systemd/system/fxbot.service` | The service | `root` |

Each backup is a folder named `<date>-before-<migration>`, holding `database.dump`, in pg_dump's custom format, and `data.tar.gz`, the chat files.

## The user and the database

| Name | What it is |
| --- | --- |
| User `fxbot` | A system user, with its home in `/var/lib/fxbot` and no login shell |
| Postgres role `fxbot` | Connects over the local socket with peer auth, as the user `fxbot` only. It has no password. |
| Postgres database `fxbot` | Owned by the role `fxbot` |

## The service

| Setting | Value |
| --- | --- |
| Runs | `node packages/server/src/index.ts`, as `fxbot`, in `/opt/fxbot/current` |
| Settings | `EnvironmentFile=/etc/fxbot/fxbot.env` |
| Starts | At boot, after the network and Postgres |
| Restarts | On failure, after 2 seconds. fxbot exits with code 75 to be restarted after an update from Settings. |
| Listens | `127.0.0.1:8787`. `GET /api/health` answers `{"ok":true,"version":"<version>"}`. |
| Log | `journalctl -u fxbot` |

## Packages

`ca-certificates`, `curl`, `git`, `postgresql`, and `xz-utils`, from apt. When the machine has no Node 22.18 or newer, Node 22 from nodejs.org, unpacked into `/usr/local` after its checksum matches.
