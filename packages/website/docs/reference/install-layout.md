# What setup.sh creates

An install made by [`setup.sh`](/docs/reference/commands/#setupsh), on Debian or Ubuntu. fxbot runs as two containers, from one compose file, under podman or docker.

## Files and folders

| Path | What it is | Owner, mode |
| --- | --- | --- |
| `/opt/fxbot/` | The install | `root`, 755 |
| `/opt/fxbot/compose.yaml` | The release's compose file: the app and its database | `root` |
| `/opt/fxbot/.env` | The install's settings for compose: `FXBOT_VERSION`, `FXBOT_UID` and `FXBOT_GID` (the `fxbot` user's), `FXBOT_ENGINE` (`podman` or `docker`), and a random `FXBOT_DB_PASSWORD` | `root`, 600 |
| `/opt/fxbot/fxbot` | The [`fxbot` command](/docs/reference/commands/#fxbot), linked as `/usr/local/bin/fxbot` | `root`, 755 |
| `/opt/fxbot/.update.lock` | Held while an update runs, so a second one waits | `root` |
| `/etc/fxbot/` | The settings and the key | `root`, 755 |
| `/etc/fxbot/secret.key` | 32 random bytes in base64, which seal every stored secret. Compose mounts it into the app, read-only, as the secret `fxbot_key`. | `fxbot`, 400 |
| `/etc/fxbot/fxbot.env` | The app's optional [settings](/docs/reference/configuration/), such as `FXBOT_LISTS_URL` | `root` |
| `/var/lib/fxbot/` | The `fxbot` user's home | `fxbot`, 700 |
| `/var/lib/fxbot/data/` | libfx's session files for each chat (`FXBOT_DATA`) | `fxbot`, 700 |
| `/var/lib/fxbot/backups/` | Backups taken before migrations change a database in use, the last five (`FXBOT_BACKUPS`) | `fxbot`, 700 |
| `/var/lib/fxbot/control/` | The app's update requests, in `requests/`, and the machine's `status.json`, which Settings shows during an update (`FXBOT_CONTROL`) | `fxbot`, 755 |
| `/etc/systemd/system/fxbot.service` | Starts the containers at boot | `root` |
| `/etc/systemd/system/fxbot-control.path` and `fxbot-control.service` | Run `fxbot apply` when the app writes a request | `root` |

The app sees the three folders in `/var/lib/fxbot` at the same paths.

Each backup is a folder named `<date>-before-<migration>`, holding `database.dump`, in pg_dump's custom format, and `data.tar.gz`, the chat files. A 0.2 install that `setup.sh` moved into containers also has `<date>-move-to-containers`, with the 0.2 database.

## The containers

The compose project is `fxbot`, with two services:

| Service | What it is |
| --- | --- |
| `fxbot` | The app: `ghcr.io/iammrduncan/fxbot:<version>`, for amd64 and arm64, with Node 22, the server, the built page, and Postgres 17's `pg_dump`. It runs as the `fxbot` user's ids, and listens on `127.0.0.1:8787` on the machine. `GET /api/health` answers `{"ok":true,"version":"<version>"}`. |
| `db` | The database: `pgvector/pgvector:0.8.7-pg17-trixie`, Postgres 17 with pgvector. Its database and role are both `fxbot`, with the password in `/opt/fxbot/.env`. Its data is in the named volume `pgdata`, not a folder on the machine. It has no port on the machine, and the app reaches it as `db`. |

| Setting | Value |
| --- | --- |
| Restarts | After a crash (`restart: unless-stopped`) |
| Stops | The app gets 90 seconds for running chats to finish, and the database a minute |
| Health | The app when its port answers, which it opens after its migrations. The database when `pg_isready` answers. |
| Log | `sudo fxbot logs`, or one container's with `sudo fxbot logs fxbot` or `sudo fxbot logs db` |

## The services

| Unit | What it does |
| --- | --- |
| `fxbot.service` | Runs `fxbot up` at boot, after the network and podman's socket (or docker), and `fxbot down` when it stops. `sudo systemctl restart fxbot` restarts fxbot. |
| `fxbot-control.path` | Watches `/var/lib/fxbot/control/requests`, and starts `fxbot-control.service` when the app writes a request |
| `fxbot-control.service` | Runs `fxbot apply` |

The user `fxbot` is a system user, with its home in `/var/lib/fxbot` and no login shell. The app's container runs as its ids, so the files the app writes are the user's.

## Packages

`ca-certificates` and `curl`, from apt. When the machine has neither podman nor docker, `podman` and Compose v2: `docker-compose` on Debian 13, or `docker-compose-v2` on Ubuntu 24.04. When it has podman without Compose v2, only Compose v2. With podman, `setup.sh` enables `podman.socket`, which Compose reaches podman through.

## After a move from 0.2

`setup.sh` leaves what 0.2 used until you remove it: `/opt/fxbot/repo`, `/opt/fxbot/releases`, `/opt/fxbot/current`, the 0.2 unit and settings kept as `/opt/fxbot/fxbot-0.2.service` and `/opt/fxbot/fxbot-0.2.env`, and the machine's Postgres with its `fxbot` database. `sudo fxbot status` prints the commands that remove them.
