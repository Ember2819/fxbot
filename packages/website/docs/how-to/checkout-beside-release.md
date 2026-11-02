# Run a checkout beside a release install

Work on fxbot from a git checkout, as yourself, on a machine that also runs a release. The checkout uses its own database, key, and ports, so the two never touch: the release keeps `fxbot`, `/etc/fxbot`, and port 8787.

You need Node 22.18 or newer, and Postgres, which a release install already has.

1. Give yourself a database and a key, once:

   ```sh
   sudo -u postgres createuser "$USER"
   sudo -u postgres createdb -O "$USER" fxbot_dev        # peer auth: you connect as your own role
   sudo install -d -o "$USER" -m 700 /etc/fxbot-dev
   openssl rand -base64 32 > /etc/fxbot-dev/secret.key && chmod 400 /etc/fxbot-dev/secret.key
   ```

2. Clone the repository, and point it at them:

   ```sh
   git clone https://github.com/iammrduncan/fxbot.git && cd fxbot
   printf '%s\n' FXBOT_DATABASE_URL=postgres:///fxbot_dev PGHOST=/var/run/postgresql FXBOT_SECRET_KEY_FILE=/etc/fxbot-dev/secret.key > .env
   npm install
   ```

   `main` holds releases only. To work on the next one, switch to its branch, `release/<next version>`.

3. Start it:

   ```sh
   npm run dev      # the page on 127.0.0.1:5173 and the API on 8788, reloading on any change
   ```

4. To reach it from your other devices, serve the page on your tailnet:

   ```sh
   tailscale serve --bg 5173                 # https://<machine>.<tailnet>.ts.net
   ```

   If the release already has the machine's address, serve one of them [at a name of its own](/docs/how-to/tailscale-service/), or on another HTTPS port with `--https=<port>`.

An app installed from the development address is the development page: every change shows up as it lands, but it can't open while `npm run dev` is down. `npm run prod` and `npm run server` default to port 8787, so give them another with `FXBOT_PORT`.

The scripts, and the settings `.env` takes, are in [Commands](/docs/reference/commands/) and [Configuration](/docs/reference/configuration/).
