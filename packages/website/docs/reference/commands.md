# Commands

## setup.sh

```sh
curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash
curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash -s -- <tag>
```

Installs fxbot on Debian or Ubuntu as containers, as root. It uses podman, or docker when only docker is installed. When neither is, it installs podman and Compose v2, on Debian 13 or Ubuntu 24.04 and newer. What it creates is in [What setup.sh creates](/docs/reference/install-layout/).

| Input | What it is |
| --- | --- |
| `<tag>` | The release to install, such as `v0.3.0`. Default: the newest stable release. A prerelease installs only by name. |
| `FXBOT_FILES` | Where each release's `deploy/` files are downloaded from, by tag. Default `https://raw.githubusercontent.com/iammrduncan/fxbot` |
| `FXBOT_IMAGE` | The app's image, without its tag. Default `ghcr.io/iammrduncan/fxbot` |
| `FXBOT_RELEASES_URL` | Where the newest release is read, in the shape of GitHub's `releases/latest`. Default `https://api.github.com/repos/iammrduncan/fxbot/releases/latest` |

`FXBOT_FILES`, `FXBOT_IMAGE`, and `FXBOT_RELEASES_URL` point an install at a fork or a mirror. When set, they are kept in `/opt/fxbot/.env`, for updates.

- Run again, it finishes an install that stopped, and leaves a working one alone, on the release it has.
- On an install of 0.2, it moves it into containers: see [Update from 0.2](/docs/how-to/update/#from-02).
- It stops, and says why, when the machine has no Compose v2 package and no Docker (Debian 12 and Ubuntu 22.04: install Docker from Docker's repository first), when another program listens on port 8787, or when fxbot doesn't start.
- On a machine without systemd, it installs everything and prints the command that starts fxbot.

## fxbot

The command for an install made by `setup.sh`: `/opt/fxbot/fxbot`, linked as `/usr/local/bin/fxbot`. Run it as root. It runs `podman compose` or `docker compose`, as `FXBOT_ENGINE` in `/opt/fxbot/.env` says, in `/opt/fxbot`.

| Command | What it does |
| --- | --- |
| `sudo fxbot status` | The version, the engine, and the containers. After a move from 0.2, it also prints the commands that remove what 0.2 left. |
| `sudo fxbot logs [<service>]` | Follows the containers' logs, from the last 100 lines. `<service>` is `fxbot` or `db`. |
| `sudo fxbot update [<version>]` | Moves to the newest stable release, or the one named. See below. |
| `sudo fxbot up` | Starts the containers, and waits up to 5 minutes until they are healthy. `fxbot.service` runs it at boot. |
| `sudo fxbot down` | Stops and removes the containers. The database's volume stays. |
| `sudo fxbot apply` | Carries out the app's requests in `/var/lib/fxbot/control/requests`. `fxbot-control.service` runs it. |
| `sudo fxbot restore <folder>` | Puts a backup in place of the database and the chat files. See below. |

### fxbot update

Moves to the newest stable release, or the one named, such as `0.3.1` or `0.4.0-rc.1`. In order, it:

1. downloads the release's `compose.yaml` and `fxbot` command, and pulls the images it doesn't have yet
2. writes the new version into `/opt/fxbot/.env`, and puts the new files in place
3. recreates the containers that changed, and waits up to 5 minutes for the app to be healthy. The new app backs up and migrates the database as it starts.

Running chats get 90 seconds to finish, and the database keeps running. Each step goes to `/var/lib/fxbot/control/status.json`, which Settings shows. Another update waits for the one running.

It refuses, and changes nothing, when:

- the version isn't one such as `0.3.0`
- the release is the running one, or older (going back is a [restore](/docs/how-to/go-back/))
- a file or an image doesn't download

If the new app isn't healthy in time, it goes back to the old compose file, command, and version, and, when the new release ran migrations, restores the backup taken before them. Settings then shows why, from the new app's last log lines.

### fxbot restore

```sh
sudo fxbot restore /var/lib/fxbot/backups/<date>-before-<migration>
```

Stops the app, starts the database if it isn't running, drops the database, and makes it again from the folder's `database.dump`. When the folder has a `data.tar.gz`, it unpacks it into `/var/lib/fxbot/data`. `sudo fxbot up` then starts the app. Name the folder by its full path.

## npm scripts

Run from a checkout's root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite on `127.0.0.1:5173`, with the API on 8788, or on `FXBOT_PORT` when the shell sets it. The API restarts when the server or the SDK changes. |
| `npm run server` | The API and the last build of the page, on `FXBOT_HOST` (default `127.0.0.1`) at `FXBOT_PORT` (default 8787) |
| `npm run prod` | `npm run build`, then `npm run server` |
| `npm run build` | Builds the page and its service worker into `packages/ui/dist/` |
| `npm run typecheck` | `tsc --noEmit` in each workspace |
| `npm run build-site` | Builds this site into `out/`, and checks its links |
| `npm run rotate-key -- <new key file>` | Seals every stored secret again under a new key. See below. |

The API that `npm run dev`, `npm run server`, and `npm run prod` start, and `npm run rotate-key`, read `.env` in the repository root when it exists.

### npm run rotate-key

Seals every stored key and token again, providers' and MCP servers' alike, under the key in `<new key file>`: 32 random bytes in base64, such as `openssl rand -base64 32` makes. It reads `FXBOT_DATABASE_URL`, and `FXBOT_SECRET_KEY_FILE` for the old key. Stop the server first, and afterwards point `FXBOT_SECRET_KEY_FILE` at the new file.
