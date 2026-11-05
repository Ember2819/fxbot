---
title: "What setup.sh creates"
description: "An install made by setup.sh, on Debian or Ubuntu. fxbot runs as three containers, from one compose file, under podman or docker: the app, its database, and the local embedder for memory search, which can be turned off."
---

An install made by [`setup.sh`](/docs/reference/commands/#setupsh), on Debian or Ubuntu. fxbot runs as three containers, from one compose file, under podman or docker: the app, its database, and the local embedder for memory search, which can be turned off.

## Files and folders

| Path | What it is | Owner, mode |
| --- | --- | --- |
| `/opt/fxbot/` | The install | `root`, 755 |
| `/opt/fxbot/compose.yaml` | The release's compose file: the app, its database, and the local embedder | `root` |
| `/opt/fxbot/compose.gpu.podman.yaml` or `compose.gpu.docker.yaml` | The release's GPU file for the engine, which runs the local embedder on an NVIDIA GPU. The `fxbot` command adds it when `FXBOT_EMBEDDER` is `gpu`. | `root` |
| `/opt/fxbot/compose.docker.yaml` | On Docker: a check every 2 seconds while a service starts. The `fxbot` command adds it on Docker 25 and newer. | `root` |
| `/opt/fxbot/docker-compose` | Compose's own release, when the machine had no Compose new enough and apt had none. | `root`, 755 |
| `/opt/fxbot/.env` | The install's settings for compose: `FXBOT_VERSION`, `FXBOT_UID` and `FXBOT_GID` (the `fxbot` user's), `FXBOT_ENGINE` (`podman` or `docker`), `FXBOT_EMBEDDER` (`cpu`, `gpu`, or `off`: where the local embedder runs), `FXBOT_COMPOSE` (the Compose binary to run, when `podman compose` or `docker compose` would run one too old), and a random `FXBOT_DB_PASSWORD` | `root`, 600 |
| `/opt/fxbot/fxbot` | The [`fxbot` command](/docs/reference/commands/#fxbot), linked as `/usr/local/bin/fxbot` | `root`, 755 |
| `/opt/fxbot/.update.lock` | Held while an update runs, so a second one waits | `root` |
| `/etc/fxbot/` | The settings and the key | `root`, 755 |
| `/etc/fxbot/secret.key` | 32 random bytes in base64, which seal every stored secret. Compose mounts it into the app, read-only, as the secret `fxbot_key`. | `fxbot`, 400 |
| `/etc/fxbot/fxbot.env` | The app's optional [settings](/docs/reference/configuration/), such as `FXBOT_LISTS_URL` | `root` |
| `/var/lib/fxbot/` | The `fxbot` user's home | `fxbot`, 700 |
| `/var/lib/fxbot/data/` | Plugins' files (`FXBOT_DATA`). An install from before 0.4.0 also has `sessions.moved`, its chats' old files, which the first start of 0.4.0 moved into the database. Delete it once you're sure of the move. | `fxbot`, 700 |
| `/var/lib/fxbot/backups/` | Backups taken before migrations change a database in use, the last five (`FXBOT_BACKUPS`) | `fxbot`, 700 |
| `/var/lib/fxbot/control/` | The app's requests, in `requests/`, for an update or a new place for the local embedder. The machine's answers: `status.json`, which Settings shows during an update, and `embedder-status.json`, for a switch of the embedder (`FXBOT_CONTROL`) | `fxbot`, 755 |
| `/etc/systemd/system/fxbot.service` | Starts the containers at boot | `root` |
| `/etc/systemd/system/fxbot-control.path` and `fxbot-control.service` | Run `fxbot apply` when the app writes a request | `root` |

The app sees the three folders in `/var/lib/fxbot` at the same paths.

Each backup is a folder named `<date>-before-<migration>`, holding `database.dump`, in pg_dump's custom format, and `data.tar.gz`, the data folder. A start backs up once, before its first change. When only the tables that hold the chats change, the folder is named `<date>-before-world-postgres-<version>`. The update to 0.4.0 took `<date>-before-0006_plugins`, whose `data.tar.gz` holds the chats' old files. A 0.2 install that `setup.sh` moved into containers also has `<date>-move-to-containers`, with the 0.2 database.

## The containers

The compose project is `fxbot`, with three services:

| Service | What it is |
| --- | --- |
| `fxbot` | The app: `ghcr.io/iammrduncan/fxbot:<version>`, for amd64 and arm64, with Node 22, the server, the built page, and Postgres 17's `pg_dump`. It runs as the `fxbot` user's ids, and listens on `127.0.0.1:8787` on the machine. `GET /api/health` answers `{"ok":true,"version":"<version>"}`. |
| `db` | The database: `pgvector/pgvector:0.8.7-pg17-trixie`, Postgres 17 with pgvector. Its database and role are both `fxbot`, with the password in `/opt/fxbot/.env`. Its data is in the named volume `pgdata`, not a folder on the machine. It has no port on the machine, and the app reaches it as `db`. |
| `embed` | The local embedder for memory search: llama.cpp's server, `ghcr.io/ggml-org/llama.cpp:server-b12033`, with EmbeddingGemma 2 (`ggml-org/embeddinggemma-2-GGUF:Q8_0`). On its first start, it downloads the model, 310 MB, into the named volume `models`. It holds about 380 MB of memory, and runs at a low CPU weight (`cpu_shares: 256`), so it gives way to the rest. It has no port on the machine, and the app reaches it at `http://embed:8080/v1` (`FXBOT_EMBED_URL`). With the GPU file, it runs `server-cuda-b12033` with Qwen3-Embedding-0.6B (`Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0`) instead. With `FXBOT_EMBEDDER=off`, it doesn't run. |

| Setting | Value |
| --- | --- |
| Restarts | After a crash (`restart: unless-stopped`) |
| Stops | The app gives running chats 30 seconds to finish, and one still running goes on when it starts again. The container is stopped after 90 seconds at most, and the database after a minute |
| Health | The app when its port answers, which it opens after its migrations. The database when `pg_isready` answers. The embedder when its `/health` answers. The app doesn't wait for the embedder, and searches by words until it answers. |
| Log | `sudo fxbot logs`, or one container's, such as `sudo fxbot logs fxbot`, `sudo fxbot logs db`, or `sudo fxbot logs embed` |

## The services

| Unit | What it does |
| --- | --- |
| `fxbot.service` | Runs `fxbot up` at boot, after the network and podman's socket (or docker), and `fxbot down` when it stops. `sudo systemctl restart fxbot` restarts fxbot. |
| `fxbot-control.path` | Watches `/var/lib/fxbot/control/requests`, and starts `fxbot-control.service` when the app writes a request |
| `fxbot-control.service` | Runs `fxbot apply` |

The user `fxbot` is a system user, with its home in `/var/lib/fxbot` and no login shell. The app's container runs as its ids, so the files the app writes are the user's.

## Packages

`ca-certificates` and `curl`, from apt. When the machine has neither podman 4 or newer nor docker, `podman`, or `docker.io` where apt's podman is older than 4. With podman, `netavark`, `aardvark-dns`, and `nftables`, which containers find each other by name through and podman only recommends, and `golang-github-containernetworking-plugin-dnsname` for a podman that has run on CNI, as Debian 12's does out of the box. When the machine has no Compose 2.26 or newer, the first of `docker-compose-plugin`, `docker-compose-v2`, and `docker-compose` that apt has new enough, or else Compose 2.40.3 from its releases, as `/opt/fxbot/docker-compose`, checked against its SHA-256. With podman, `setup.sh` enables `podman.socket`, which Compose reaches podman through. It installs nothing for a GPU: the local embedder on one needs NVIDIA's driver and container toolkit, which you install yourself ([On a GPU](/docs/how-to/memory-search/#on-a-gpu)).

## After a move from 0.2

`setup.sh` leaves what 0.2 used until you remove it: `/opt/fxbot/repo`, `/opt/fxbot/releases`, `/opt/fxbot/current`, the 0.2 unit and settings kept as `/opt/fxbot/fxbot-0.2.service` and `/opt/fxbot/fxbot-0.2.env`, and the machine's Postgres with its `fxbot` database. `sudo fxbot status` prints the commands that remove them.
