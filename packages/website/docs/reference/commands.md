# Commands

## setup.sh

```sh
curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash
curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash -s -- <tag>
```

Installs fxbot on Debian or Ubuntu, as root. What it creates is in [What setup.sh creates](/docs/reference/install-layout/).

| Input | What it is |
| --- | --- |
| `<tag>` | The release to install, such as `v0.1.0`. Default: the newest stable release. A prerelease installs only by name. |
| `FXBOT_REPO` | The git remote to install from. Default `https://github.com/iammrduncan/fxbot.git` |
| `FXBOT_NODE_DIST` | Where Node 22 is downloaded from, with its `SHASUMS256.txt`. Default `https://nodejs.org/dist/latest-v22.x` |

- Run again, it finishes an install that stopped, and leaves a working one alone, on the release it has.
- It stops, and says why, when a database `fxbot` belongs to another role, a key in `/etc/fxbot` belongs to another user, or another program listens on port 8787.
- On a machine without systemd, it installs everything and prints the command that starts fxbot.

## npm scripts

Run from the repository root, or from `/opt/fxbot/current` in a release install.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite on `127.0.0.1:5173`, with the API on 8788, or on `FXBOT_PORT` when the shell sets it. The API restarts when the server or the SDK changes. |
| `npm run server` | The API and the last build of the page, on `127.0.0.1` at `FXBOT_PORT` (default 8787) |
| `npm run prod` | `npm run build`, then `npm run server` |
| `npm run build` | Builds the page and its service worker into `packages/ui/dist/` |
| `npm run typecheck` | `tsc --noEmit` in each workspace |
| `npm run build-site` | Builds this site into `out/`, and checks its links |
| `npm run update [-- <version>]` | Updates a release install. See below. |
| `npm run rotate-key -- <new key file>` | Seals every stored secret again under a new key. See below. |

The API that `npm run dev`, `npm run server`, and `npm run prod` start, and `npm run rotate-key`, read `.env` in the repository root when it exists.

### npm run update

Builds the newest stable release, or the one named, in `/opt/fxbot/releases/<tag>/`, then points `/opt/fxbot/current` at it. It keeps the release it replaced, and removes any other. Restart fxbot to run it. Run it as `fxbot`:

```sh
cd /opt/fxbot/current && sudo -u fxbot -H npm run update
```

It refuses, and changes nothing, when:

- the folder isn't a release install made by `setup.sh` (a checkout updates with git)
- the release is the running one, or older (going back is a [restore](/docs/how-to/go-back/))
- another update is running
- the new release doesn't build

### npm run rotate-key

Seals every stored key and token again, providers' and MCP servers' alike, under the key in `<new key file>`: 32 random bytes in base64, such as `openssl rand -base64 32` makes. It reads `FXBOT_DATABASE_URL`, and `FXBOT_SECRET_KEY_FILE` for the old key. Stop the server first, and afterwards point `FXBOT_SECRET_KEY_FILE` at the new file.
