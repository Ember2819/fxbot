# Containers

fxbot runs as containers. `setup.sh` uses podman, or docker when only docker is installed, and one compose file runs fxbot and its database. Settings' Update asks the machine to move to the next release. A small host command does the work, and puts the old release back if the new one doesn't start.

Status: built on 2026-11-02, on `release/0.3.0`. The human checks at the end of the checklist are still open. Planned the same day; the owner decided the shape the same day: podman first, docker as the fallback, and one compose file for fxbot, its database (pgvector's image), and the local embedder that [memories](memories.md) adds. This phase builds fxbot and the database; memories adds the embedder.

## 0. Core or add-on

**Core: what fxbot needs to run** ([Core or add-on](../../../CONVENTIONS.md#core-or-plugin)). It replaces the install that [releases](releases.md) built, where `setup.sh` installed Node and the distro's Postgres on the machine, and an update built the next release in place. Distros ship different Postgres versions, and some have no pgvector, which memories needs. In containers, every machine runs the same Node, the same Postgres, and pgvector.

## 1. Research

Checked on 2026-11-02 against each project's files and docs, and with a prototype on this machine (podman 5.4.2, Docker Compose 5.7.0 through podman's socket).

### The references

None of them lets the app update its own containers.

- **CopilotKit OpenBot** publishes `ghcr.io/copilotkit/openbot` per version, with the digests in each release. It is one Ubuntu container whose supervisor runs the API, Chromium, and an optional Postgres. Its development compose uses `pgvector/pgvector:pg17`. A "supervisor" service holds the Docker socket for bots' computers, and its comments call that "still root-equivalent". To update, the owner pulls a new tag.
- **OpenDots** builds from `node:24-bookworm-slim`, keeps SQLite in a volume, binds to 127.0.0.1, and refuses to start without `${OWNER_TOKEN:?}`. Updating means a rebuild. **OpenDuet** publishes no image. **openmuse** deploys to Render.
- **eve** runs as a Node server under the owner's process manager, with no image or compose file. Its docs warn that changing the eve version strands sessions that were running.
- **fx** and **Pi** are command-line tools that update themselves (`fx upgrade`, `pi update`). **Grok bot** is hosted by xAI, with nothing to install. **fx0**, **durable-harness**, **agent-desktop**, and **agent-browser** have no container deployment.

### Self-hosted apps that run as compose stacks

- **Immich:** its install script downloads the release's compose file and `example.env`, puts a random database password in `.env`, and runs `up -d`. Updating is `compose pull` and `up -d` by hand; the page only says a version is out. The app container runs `pg_dump` itself, with Postgres clients in its image. "Downgrading … is not supported."
- **Open WebUI** and **n8n:** pull and recreate by hand. "Database migrations are one-way": going back means the old tag and a backup.
- **Home Assistant:** its Supervisor is a privileged container with the Docker socket. A Core update pulls, starts, checks the API, and reinstalls the previous image on failure. Host jobs go through a D-Bus daemon on the host.
- **Umbrel** and **CasaOS** run their control daemon on the host as root. **Coolify**'s app container reaches the host over SSH and runs an upgrade script, which writes a status file that the page reads.
- **Runtipi** (to v1.5): the dashboard container appended commands to a shared file, and a host watcher ran them and wrote status back. No socket.
- **Watchtower** is archived (December 2025), needs the socket, and has no rollback. **`podman auto-update`** works only for containers run by systemd units (quadlets), not compose, and rolls back the image but never the database.
- **Rollback** across Immich, n8n, GitLab, Forgejo, and Mastodon means restoring a dump. Forgejo refuses to start on a newer database, as fxbot does.
- **Moving a native install** (Mastodon, GitLab, Nextcloud, Gitea): stop the service, `pg_dump`, restore into the container with `--no-owner`, and give the data folders to the container's user id.

### Images and compose

- **Base image.** libfx 0.0.16's native addon is built for glibc, on x64 and arm64. On musl, libfx falls back to WebAssembly that needs an experimental flag, so Alpine is out. `node:22-trixie-slim` is 81.5 MB compressed. Debian 13 ships `postgresql-client-17`, which a `pg_dump` against Postgres 17 needs: it adds 11 MB of packages, 64 MB installed, mostly Perl. The slim image lacks `ca-certificates`.
- **Publishing.** ghcr.io takes images from GitHub Actions with `packages: write` and the workflow's token. A new package starts private, and the owner makes it public once in its settings. The `org.opencontainers.image.source` label links it to the repository.
- **Two architectures.** `ubuntu-24.04-arm` runners are free for public repositories, but one job with QEMU is simpler. npm can install another CPU's packages, so the build stage runs on the runner's own CPU: `npm ci --omit=dev -w @fxbot/server --cpu=arm64 --os=linux --libc=glibc` installs only libfx's arm64 addon (19 packages, 37 MB). Only the last stage's `apt-get` runs under QEMU.
- **Compose.**
  - `podman compose` runs docker-compose when it's installed, and podman-compose otherwise. docker-compose (Compose v2) reaches podman through `podman.socket`, which Debian doesn't enable by default.
  - podman-compose waits for health (`up --wait`) only from 1.6.0 (June 2026), which no stable distro ships, and before that it doesn't notice a new image under a tag. Compose v2 has `--wait` since 2.1.1 and `--wait-timeout` since 2.17.
  - The distros have:

    | Distro | podman | Compose v2 package |
    | --- | --- | --- |
    | Debian 13 | 5.4.2 | `docker-compose` 2.26.1 |
    | Ubuntu 24.04 | 4.9.3 | `docker-compose-v2` 2.40.3 |
    | Debian 12 | 4.3.1 | none |
    | Ubuntu 22.04 | 3.4.4 | none |

- **Starting at boot.** Podman has no daemon. A crashed container is restarted by its `restart:` policy, but after a reboot `podman-restart.service` starts only `restart=always` containers (podman 5.7 and older). So a systemd unit runs `compose up -d` at boot, for podman and docker alike. Logs go to journald on Debian and Ubuntu.
- **pgvector's image.** `pgvector/pgvector:0.8.7-pg17` is built on Debian 12; `0.8.7-pg17-trixie` matches fxbot's base. The `postgres` user is uid 999, data is in `/var/lib/postgresql/data`, and its health check should be `pg_isready -h 127.0.0.1`, since a socket-only check can pass during first setup.
- **systemd path units** fire `PathExists=` when a file appears, and `DirectoryNotEmpty=` when a folder gets one, and run their service again while the condition still holds, so the service moves the file away first. Files whose names start with a dot are ignored, so a writer writes `.update.json` and renames it. inotify works on bind mounts.

### The prototype

Built on 2026-11-02 from the repository with a two-stage file in the scratchpad, then removed. It ran beside the owner's 0.2 install, which it didn't touch.

- The image was 339 MB unpacked: the 236 MB base, `pg_dump` 17.11, 39 MB of production packages (17 of them), and the 1.3 MB page. The page build needs `tsconfig.base.json` from the root.
- libfx reported `"backend":"native"` in the container.
- Against `pgvector/pgvector:0.8.7-pg17`, the server applied 0001 to 0004 and was healthy 0.9 s after starting. `pg_dump` from the app container wrote a backup owned by the host's `fxbot` user (uid 995).
- Idle memory: the app 105 MB, the database 14 MB.
- Under `podman compose` (Compose v2), with `user: "${FXBOT_UID}:${FXBOT_GID}"`, `.env`, bind mounts, and a named volume:
  - `up -d --wait` brought up the stack, with an embedder, in 28 s.
  - Recreating only the app took 3.8 s to healthy with a 3 s health interval, and the database kept running. Podman ignored `start_interval`.
  - Podman split a health check's inline command at its spaces, so a health check is a script with no arguments.
  - After `kill -9`, podman restarted the app (`restart: unless-stopped`).
  - The app reached the embedder by service name. `cpu_shares: 256` gave the embedder a CPU weight of 10 against the app's 100.
- The update channel: the app wrote a request into a bind-mounted folder, a host script recreated the app as a new container, and the new app read the result. Registering a systemd path unit on this machine was refused by the session's permissions, so the trigger itself is a check for the owner.

## 2. Key takeaways

1. **An image per release, on ghcr.io**, for amd64 and arm64, from Debian slim. The page is built on the runner's own CPU, and npm installs the other CPU's libfx addon, so emulation only runs `apt-get`.
2. **Compose v2 on both engines.** `podman compose` with docker-compose through `podman.socket`, or `docker compose`. It waits for health and recreates only what changed. podman-compose can't yet.
3. **The app never holds the socket.** It asks the host through a request file in a shared folder, as Runtipi v1 did, and a systemd path unit runs a root-owned script that acts on it. The request carries only a version, and the script checks it. The socket would make the app root-equivalent on the machine.
4. **Updates check health, and go back on failure.** The script pulls, recreates, and waits for health. If the new release doesn't come up, it starts the old image again, restoring the backup taken before migrations when any ran. Others restore by hand; fxbot already takes the backup.
5. **Backups stay in the app.** `migrate.ts` already runs `pg_dump` before migrating, so the image carries the Postgres 17 client, as Immich's does. Every install kind then backs up the same way.
6. **One systemd unit for boot,** `fxbot.service`, running `compose up -d --wait` and `compose down`, as today's unit name. Crashes are the restart policy's job.
7. **The data stays where it is.** Chats in `/var/lib/fxbot/data`, backups beside them, and the key in `/etc/fxbot`, bind-mounted, owned by the same `fxbot` user, whose ids the app container runs as. Only the database moves, into a named volume.
8. **A 0.2 install moves in one run of `setup.sh`:** stop, dump the machine's database, restore it into the container, and start. The old database stays until the owner drops it.

## 3. Implementation

### The image (`Dockerfile`, `.dockerignore`)

```dockerfile
FROM --platform=$BUILDPLATFORM docker.io/library/node:22-trixie-slim AS build
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
COPY packages/website/package.json packages/website/
RUN npm ci --no-audit --no-fund
COPY packages/sdk packages/sdk
COPY packages/server packages/server
COPY packages/ui packages/ui
RUN npm run build
# The server's packages for the image's CPU: libfx's addon is the only native one.
RUN rm -rf node_modules && npm ci --omit=dev -w @fxbot/server --no-audit --no-fund \
      --os=linux --libc=glibc --cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH")

FROM docker.io/library/node:22-trixie-slim
LABEL org.opencontainers.image.source=https://github.com/iammrduncan/fxbot
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/sdk packages/sdk
COPY --from=build /app/packages/server packages/server
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY deploy/health /usr/local/bin/fxbot-health
ENV FXBOT_HOST=0.0.0.0 NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "packages/server/src/index.ts"]
```

`node_modules` keeps its workspace links (`@fxbot/sdk` to `packages/sdk`), which `COPY` preserves. `.dockerignore` leaves out `node_modules`, `.git`, `out`, `dist` folders, `docs`, `archive`, and `.env`. The image runs as `node` by default, and compose gives it the `fxbot` user's ids.

- **`deploy/health`**: `#!/bin/bash` and `exec 3<>/dev/tcp/127.0.0.1/8787`. The server listens only after its migrations, so an open port means ready, and the check costs no Node start.
- **`FXBOT_HOST`**: the server listens on it, 127.0.0.1 by default. The image sets 0.0.0.0, and compose publishes the port on the machine's 127.0.0.1 only.

### The stack (`deploy/compose.yaml`)

```yaml
name: fxbot
services:
  fxbot:
    image: ${FXBOT_IMAGE:-ghcr.io/iammrduncan/fxbot}:${FXBOT_VERSION:?}
    user: "${FXBOT_UID:?}:${FXBOT_GID:?}"
    env_file: [/etc/fxbot/fxbot.env]
    environment:
      FXBOT_DATABASE_URL: postgres://fxbot:${FXBOT_DB_PASSWORD:?}@db/fxbot
      FXBOT_SECRET_KEY_FILE: /run/secrets/fxbot_key
      FXBOT_DATA: /var/lib/fxbot/data
      FXBOT_BACKUPS: /var/lib/fxbot/backups
      FXBOT_CONTROL: /var/lib/fxbot/control
    secrets: [fxbot_key]
    volumes:
      - /var/lib/fxbot/data:/var/lib/fxbot/data
      - /var/lib/fxbot/backups:/var/lib/fxbot/backups
      - /var/lib/fxbot/control:/var/lib/fxbot/control
    ports: ["127.0.0.1:${FXBOT_PORT:-8787}:8787"]
    depends_on: { db: { condition: service_healthy } }
    healthcheck: { test: [CMD, fxbot-health], interval: 3s, timeout: 2s, retries: 3 }
    restart: unless-stopped
  db:
    image: docker.io/pgvector/pgvector:0.8.7-pg17-trixie
    environment: { POSTGRES_USER: fxbot, POSTGRES_DB: fxbot, POSTGRES_PASSWORD: "${FXBOT_DB_PASSWORD:?}" }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: [CMD, pg_isready, -h, 127.0.0.1, -U, fxbot, -d, fxbot], interval: 3s }
    stop_grace_period: 1m
    restart: unless-stopped
secrets: { fxbot_key: { file: /etc/fxbot/secret.key } }
volumes: { pgdata: {} }
```

- **`/opt/fxbot/.env`** (root only) holds `FXBOT_VERSION`, `FXBOT_UID`, `FXBOT_GID`, `FXBOT_DB_PASSWORD` (random, from `setup.sh`), and `FXBOT_ENGINE` (`podman` or `docker`). `FXBOT_IMAGE` and `FXBOT_FILES` (where the tag's `deploy/` files come from, GitHub's raw files by default) point a fork or a mirror elsewhere, as `FXBOT_REPO` does for `setup.sh` today.
- **`/etc/fxbot/fxbot.env`** keeps the owner's optional settings, such as `FXBOT_LISTS_URL` and `FXBOT_VERCEL_CLIENT_ID`, as today.
- **The database** isn't published to the machine. Only the app container reaches it, by service name.
- **The key** stays `/etc/fxbot/secret.key`, owned by `fxbot` and readable by it alone. Compose mounts it read-only.
- [Memories](memories.md) adds the `embed` service to this file, and its GPU override files beside it.

### The host command (`deploy/fxbot`, installed as `/opt/fxbot/fxbot` and `/usr/local/bin/fxbot`)

A shell script of about 150 lines, run as root. It finds its engine in `.env`, and runs `podman compose` or `docker compose` in `/opt/fxbot`, without `-f`, so compose also merges a `compose.override.yaml` there. fxbot never writes that file, and updates leave it alone; the [agent computer](computer.md) uses it.

| Command | Does |
| --- | --- |
| `fxbot up` and `fxbot down` | `compose up -d --wait --wait-timeout 300 --remove-orphans`, and `compose down`. `fxbot.service` runs them |
| `fxbot update [version]` | Moves to the newest release, or the one named (below) |
| `fxbot apply` | Reads the app's request and carries it out. `fxbot-control.service` runs it |
| `fxbot logs` and `fxbot status` | `compose logs -f`, and `compose ps` with the version |

**An update**, under `flock`, writing each step to `/var/lib/fxbot/control/status.json` for Settings:
1. Checks the version: `x.y.z`, and newer than the running one. A version with no image fails at the pull.
2. Downloads that tag's `deploy/compose.yaml` and `deploy/fxbot` beside the old ones, and pulls its images. Nothing changes if a download or pull fails. New files are renamed into place, so the running script keeps reading its own.
3. Notes the database's migrations (`compose exec -T db psql -Atc 'select count(*) from fxbot_migrations'`), writes the new version into `.env`, puts the new files in place, and runs `compose up -d --wait`. The new app backs up and migrates as it starts, as today.
4. If the app isn't healthy within 5 minutes, it goes back:
   - the old `.env`, compose file, and script, and the old image
   - if migrations ran, first the backup the new app took before them, restored with `pg_restore --clean --if-exists` and the chat files' tarball
   - the status says it went back, and why, from the new app's last log lines

**A request from the app** is a JSON file in `/var/lib/fxbot/control/requests`. The app writes `.update.json` and renames it to `update.json`, since systemd ignores names that start with a dot. `fxbot-control.path` (`DirectoryNotEmpty=` on that folder) starts `fxbot-control.service`, which runs `fxbot apply`. That moves each request aside first, then carries out the ones it knows: `update.json` runs `fxbot update <version>` with the version it names, and nothing else. Memories adds `embedder.json`, which switches the local embedder between the CPU and a GPU.

### systemd units (written by `setup.sh`)

```ini
# fxbot.service
[Unit]
Description=fxbot
Wants=network-online.target
After=network-online.target podman.socket
Requires=podman.socket            # docker.service on a docker machine

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/fxbot/fxbot up
ExecStop=/opt/fxbot/fxbot down
TimeoutStartSec=10min

[Install]
WantedBy=multi-user.target
```

`fxbot-control.path` watches `/var/lib/fxbot/control/requests` with `DirectoryNotEmpty=`, and `fxbot-control.service` (`Type=oneshot`) runs `/opt/fxbot/fxbot apply`. `sudo systemctl restart fxbot` still restarts fxbot, as the docs say today.

### `setup.sh`

Rewritten, at about 200 lines. In order:
1. **Checks:** root, apt.
2. **The engine:**
   - podman if it's installed, or docker if only docker is.
   - Otherwise it installs podman and Compose v2 (`podman docker-compose` on Debian 13, `podman docker-compose-v2` on Ubuntu 24.04), with `--no-install-recommends`, and enables `podman.socket`.
   - On Debian 12 and Ubuntu 22.04, it stops and says to install Docker from Docker's repository, then run it again.
3. **The user and folders:** the `fxbot` system user, `/etc/fxbot/secret.key`, and `/var/lib/fxbot/{data,backups,control}`, as today.
4. **The release:** the newest, or the one named. It downloads that tag's `deploy/compose.yaml` and `deploy/fxbot` into `/opt/fxbot`, and writes `.env` with a random database password.
5. **A 0.2 install moves** when `/opt/fxbot/current` and the machine's `fxbot` database exist (below).
6. **The services:** the units, enabled and started, then a wait for `http://127.0.0.1:8787/api/health`.

Running it again leaves a working install alone and finishes one that stopped, as today.

**Moving a 0.2 install:**
1. Stop and disable the old `fxbot.service`, and keep its unit as `/opt/fxbot/fxbot-0.2.service`.
2. `pg_dump --format=custom` the machine's `fxbot` database, as `postgres`, into `/var/lib/fxbot/backups/<date>-move-to-containers/`.
3. Start the `db` container alone, wait for it, and `pg_restore --no-owner --role=fxbot` the dump into it.
4. Rewrite `/etc/fxbot/fxbot.env` without the old database lines (`FXBOT_DATABASE_URL`, `PGHOST`, `PGPORT`). The chat files and the key stay where they are, already owned by `fxbot`.
5. Start the stack. 0.3.0's migrations run with their usual backup.
6. Leave the machine's Postgres, its `fxbot` database, and `/opt/fxbot/{repo,releases,current}` alone, and print how to remove them.

Going back to 0.2 means stopping the containers and putting the kept unit and settings back (`fxbot-0.2.service` and `fxbot-0.2.env`, which the move keeps in `/opt/fxbot`). The machine's database never changed.

### The app (`packages/server`, `packages/ui`)

- **`index.ts`:** listens on `FXBOT_HOST`. `POST /api/update` writes the request when `FXBOT_CONTROL` is set. `GET /api/update` reads `status.json`. Restarting with exit code 75 goes away.
- **`control.ts`** replaces `update.ts`, at about 50 lines: whether this install can update (`FXBOT_CONTROL`), the request, and the status. `npm run update` goes away: an install updates with `sudo fxbot update`, and a checkout with git.
- **`release.tsx`:** Settings' Update writes the request, then shows the status's steps until the new version answers, or the status says it went back. The page reloads onto the new version, as today.

### A checkout (`deploy/compose.dev.yaml`)

A compose file of its own, project `fxbot-dev`, with the database on `127.0.0.1:5433` and a volume of its own. Memories adds its embedder on `127.0.0.1:8081`. It runs beside a release install on one machine.

```sh
podman compose -f deploy/compose.dev.yaml up -d      # or docker compose
```

`.env` gains `FXBOT_DB_PASSWORD` and `FXBOT_DATABASE_URL=postgres://fxbot:<password>@127.0.0.1:5433/fxbot_dev`. `npm run dev` doesn't change. `pg_dump` for its backups needs a Postgres 17 client on the machine, as today. The README shows how to move an existing `fxbot_dev` database across with `pg_dump` and `pg_restore`.

### The release workflow

A job `image` between `check` and `publish`, and `publish` waits for it, so Settings never offers a version without an image:

```yaml
  image:
    needs: check
    if: needs.check.outputs.release == 'true'
    runs-on: ubuntu-24.04
    permissions: { contents: read, packages: write }
    steps:
      - uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0
      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1
      - uses: docker/login-action@81c6f93d4bc991e510b342a00b419b3bb4efc5c6 # v4.7.0
        with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ github.token }}" }
      - id: meta
        uses: docker/metadata-action@dc802804100637a589fabce1cb79ff13a1411302 # v6.2.0
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}},value=${{ needs.check.outputs.tag }}
            type=semver,pattern={{major}}.{{minor}},value=${{ needs.check.outputs.tag }}
      - uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

metadata-action adds `latest` for a stable version only. A prerelease such as `0.3.0-rc.1` gets its own tag.

### Docs

- **README:** Install, Reaching it, Run from a checkout, Releasing, and the variables (`FXBOT_HOST`, `FXBOT_CONTROL`).
- **The site:** the tutorial, the how-tos (update, back up, go back, run a checkout beside a release, the Tailscale Service), the install layout, commands, and configuration references, the releases explanation, the home page's requirements, and `setup.sh`'s steps.
- **AGENTS.md:** the checks, and how `npm run server` reaches the database.
- **`CHANGELOG.md`:** under Before upgrading, that `setup.sh` moves a 0.2 install into containers, and that Settings can't make that move.

### Speed

- **Loading the page, sending, and streaming:** the same server, behind a published port on 127.0.0.1.
- **Memory at idle:** the app 105 MB and the database 14 MB, measured.
- **Disk:** about 110 MB compressed for fxbot's image (estimated from its parts), and 163 MB for the database's.
- **An update** downloads only the layers that changed, then the app is down for about 4 seconds, measured. The database keeps running.
- **Health checks** open a port from bash every 3 seconds, with no Node start.

### Changed while building

- **Pulls:** `fxbot update` pulls with `--policy missing`. A release's tags never change, so an image already on the machine is the right one, and checks can use local images.
- **Restoring:** `fxbot restore` drops the database and makes it again before `pg_restore`, instead of `--clean`, so tables that a newer release added go too, and the same migration can run again later. It starts the database container itself, so the move from 0.2 and going back use the same command.
- **Stopping:** the app gets `stop_grace_period: 90s`, as systemd gave it, so running chats finish before an update replaces it.
- **Two updates at once:** the second reads `.env` again once it holds the lock, since the first may have changed the version while it waited.
- **Checks:** `FXBOT_ROOT` puts the compose file's machine folders under another root, beside `COMPOSE_PROJECT_NAME` and `FXBOT_PORT`, so a check runs beside a real install.
- **MCP sign-ins** still redirect to `http://127.0.0.1:<port>`, not to `FXBOT_HOST`.
- **Running `setup.sh` again** starts `fxbot.service` if it's stopped, and doesn't restart a running install.

### Not in this phase

- The embedder and its GPU files: [memories](memories.md).
- Updates on their own: Settings still shows the release, and the owner chooses.
- Quadlets, `podman auto-update`, and rootless podman.
- Distros without Compose v2 packages, other than through Docker's repository.

### Size

About 650 lines added and 200 removed:
- **Added:** `Dockerfile` 30, `deploy/compose.yaml` 40, `deploy/compose.dev.yaml` 15, `deploy/fxbot` 150, `deploy/health` 2, `setup.sh` about 200 (rewritten), the workflow 30, `control.ts` 50, and changes in `index.ts` and `release.tsx`.
- **Removed:** `update.ts` (128 lines), most of the old `setup.sh`, and `npm run update`.

Built: 549 lines added and 276 removed across the image, `deploy/`, `setup.sh`, the workflow, and the app, not counting docs.

## 4. Checklist

Checks run on this machine, which has podman 5.4.2 and Docker Compose, beside the owner's 0.2 install, with other names and ports, and are removed after. Writing systemd units or packages to this machine needs the owner's go-ahead. The rest is checked here, and the full `setup.sh` on a fresh machine is a human check.

**M1. The image**
- [x] `podman build .` makes an image for this machine's CPU, in 23 s with a warm cache, and `--platform linux/arm64 --target build` installs only `libfx-linux-arm64-gnu`.
- [x] In it: Node 22.23.4, `pg_dump` 17.11, and `fxbot-health`. libfx reports `"backend":"native"`, the workspace links survive, and the server listens on `FXBOT_HOST` (0.0.0.0) as user `node` by default.
- [x] 340 MB unpacked, 109 MB compressed.

**M2. The stack**
- [x] `deploy/compose.yaml`, with a scratch `.env`, a scratch key and folders, and another project name and port, came up with `up -d --wait` in 11 s. The app migrated a fresh database, and answered on 127.0.0.1 only.
- [x] The database has no port on the machine. The app runs as uid 995 (the machine's `fxbot`), and its files and backups are owned by 995:987.
- [x] A missing `FXBOT_DB_PASSWORD` stops compose with "required variable FXBOT_DB_PASSWORD is missing a value". `FXBOT_VERSION` uses the same `:?` form.
- [x] `kill -9` of the app restarted it. `compose down` and `up` kept a bot made before.

**M3. Updates**
- [x] Local tags stood in for releases, with `FXBOT_IMAGE` and `FXBOT_FILES` pointed at them. `fxbot update 0.3.1` took 4.6 s: the steps reached `status.json`, the database kept running, and the app answered as 0.3.1.
- [x] The same version, an older one, `abc;rm`, and 9.9.9 (no files) were each refused with the reason, and `.env` kept 0.3.1.
- [x] An image that never got healthy went back to the old one in 14 s. An image that added migration `0099` and then failed went back in 13 s: its backup was restored, `0099` and its table were gone, the bot was there, and the old app started on it.
- [x] In Chromium, Settings' Update wrote the request ("Asking the machine to update"), and with `fxbot apply` run by hand the page showed "Getting" and "Starting" and reloaded as 0.3.5. For a release that didn't start, it showed the steps and "0.3.6 didn't start, so fxbot went back to 0.3.5." A second Update while one waits answers 409.
- [x] Two updates at once: the second waited for the first's lock, read the version again, and then ran.

**M4. Moving a 0.2 install**
- [x] A scratch database on the machine's Postgres, made by the 0.2.1 server with a bot, a provider with a sealed key (checked against a mock server), messages, and a library file, moved with `pg_dump` and `fxbot restore` into a scratch stack. Every count matched, the key unsealed in the container, the library file was served, and a chat file stayed in place. This phase adds no migration.
- [x] The old database was unchanged afterwards.

**M5. A checkout, the workflow, and docs**
- [x] `deploy/compose.dev.yaml` ran on another port beside the M3 stack, and the server that `npm run dev` starts migrated and answered on it.
- [x] The workflow's `image` job is written, `publish` waits for it, and each action's SHA matches its tag on GitHub. Its first real run is the owner's release.
- [x] The docs are written: the README, AGENTS.md, the changelog, the home page, and 12 site pages. `npm run build-site` (1,760 links in 24 pages), `npm run typecheck`, `npm run build`, `git diff --check`, and `bash -n` on both scripts pass.

**Human checks**
- [ ] `setup.sh` on a fresh Debian 13 or Ubuntu 24.04 machine with nothing installed: podman, Compose, the stack, and both units. fxbot answers after a reboot.
- [ ] On a machine with only docker, `setup.sh` uses it.
- [x] The owner's own install, at 0.1.0, moved with `setup.sh` from local files before the release, and its chats, providers, MCP servers, and skills were all there. It then updated to the released 0.3.0 with `fxbot update`, with the database and embedder running throughout.
- [x] After v0.3.0, ghcr.io served the image with no login, with no step needed to make it public: `0.3.0`, `0.3`, and `latest`, each an index of amd64 and arm64. The owner's machine pulled 0.3.0 (amd64).
- [ ] Settings' Update, through the path unit, moves to the next release.

## 5. Open questions

Each has a default that the build follows unless the owner changes it.

1. **Older distros.** *Default:* `setup.sh` installs podman and Compose v2 on Debian 13 and Ubuntu 24.04 or newer. On Debian 12 and Ubuntu 22.04, it asks for Docker from Docker's repository first.
2. **Going back on its own.** *Default:* a failed update goes back to the old release by itself, restoring the backup when migrations ran. The other way is to stop and show the steps.
3. **Image tags.** *Default:* `x.y.z`, `x.y`, and `latest` for stable releases, on ghcr.io. Compose pins the exact version.
4. **After a move.** *Default:* the machine's Postgres, the old database, and the old release folders stay until the owner removes them. `fxbot status` says how.
