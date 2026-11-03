---
title: "Run a checkout beside a release install"
description: "Work on fxbot from a git checkout, as yourself, on a machine that also runs a release. The checkout uses its own database and embedder containers, key, and ports, so the two never touch: the release keeps the fxbot containers, /etc/fxbot, and port 8787."
---

Work on fxbot from a git checkout, as yourself, on a machine that also runs a release. The checkout uses its own database and embedder containers, key, and ports, so the two never touch: the release keeps the `fxbot` containers, `/etc/fxbot`, and port 8787.

You need Node 22.18 or newer, and podman or docker for the checkout's database and embedder. A release install already has one of them. Backups before migrations use the machine's `pg_dump`, which must be Postgres 17's.

1. Clone the repository:

   ```sh
   git clone https://github.com/iammrduncan/fxbot.git && cd fxbot
   npm install
   ```

   `main` holds releases only. To work on the next one, switch to its branch, `release/<next version>`.

2. Give yourself a key and a database password, once, and point the checkout at them:

   ```sh
   sudo install -d -o "$USER" -m 700 /etc/fxbot-dev
   openssl rand -base64 32 > /etc/fxbot-dev/secret.key && chmod 400 /etc/fxbot-dev/secret.key
   pw=$(openssl rand -hex 16)
   printf '%s\n' "FXBOT_DB_PASSWORD=$pw" "FXBOT_DATABASE_URL=postgres://fxbot:$pw@127.0.0.1:5433/fxbot_dev" FXBOT_EMBED_URL=http://127.0.0.1:8081/v1 FXBOT_SECRET_KEY_FILE=/etc/fxbot-dev/secret.key > .env
   ```

3. Start the database, `fxbot_dev` on 127.0.0.1:5433, and the local embedder for memory search, on 127.0.0.1:8081, in a compose project of their own, `fxbot-dev`:

   ```sh
   podman compose -f deploy/compose.dev.yaml --env-file .env up -d        # or docker compose
   ```

   With podman as yourself, Compose reaches podman through your own socket. If it can't connect, turn the socket on once with `systemctl --user enable --now podman.socket`.

   The embedder downloads its model, 310 MB, on its first start, and until it answers, memory search uses words alone. To put it on another port, set `FXBOT_EMBED_PORT` in `.env`, and the same port in `FXBOT_EMBED_URL`.

4. Start fxbot:

   ```sh
   npm run dev      # the page on 127.0.0.1:5173 and the API on 8788, reloading on any change
   ```

5. To reach it from your other devices, serve the page on your tailnet:

   ```sh
   tailscale serve --bg 5173                 # https://<machine>.<tailnet>.ts.net
   ```

   If the release already has the machine's address, serve one of them [at a name of its own](/docs/how-to/tailscale-service/), or on another HTTPS port with `--https=<port>`.

An app installed from the development address is the development page: every change shows up as it lands, but it can't open while `npm run dev` is down. `npm run prod` and `npm run server` default to port 8787, so give them another with `FXBOT_PORT`.

## A checkout from before 0.3

Before 0.3, a checkout's `fxbot_dev` database was on the machine's own Postgres. To move it into the container:

1. In `.env`, put the `FXBOT_DB_PASSWORD`, `FXBOT_DATABASE_URL`, and `FXBOT_EMBED_URL` lines from step 2 in place of the old `FXBOT_DATABASE_URL` and `PGHOST`. Keep `FXBOT_SECRET_KEY_FILE` and its key, which sealed the keys and tokens in that database.
2. Start the database and the embedder, as in step 3.
3. Copy the old database across:

   ```sh
   pg_dump --format=custom fxbot_dev > fxbot_dev.dump
   podman compose -f deploy/compose.dev.yaml --env-file .env exec -T db pg_restore -U fxbot -d fxbot_dev --no-owner < fxbot_dev.dump
   ```

The scripts, and the settings `.env` takes, are in [Commands](/docs/reference/commands/) and [Configuration](/docs/reference/configuration/).
