# Configuration

fxbot's server reads its settings from environment variables. The key that seals secrets is a file, named by `FXBOT_SECRET_KEY_FILE`.

## Where they are set

| Install | Where | Read by |
| --- | --- | --- |
| A release, from `setup.sh` | `/etc/fxbot/fxbot.env`, for optional settings such as `FXBOT_LISTS_URL`. The release's compose file sets the rest. | The app's container, through compose's `env_file`. A change takes effect at the next `sudo systemctl restart fxbot`. |
| A checkout | The environment, or `.env` in the repository root. The environment wins. | The server and its commands. Vite reads no `.env`. |

In a release, the compose file sets these for the app, with the database password from `/opt/fxbot/.env`:

```sh
FXBOT_DATABASE_URL=postgres://fxbot:<password>@db/fxbot
FXBOT_SECRET_KEY_FILE=/run/secrets/fxbot_key
FXBOT_DATA=/var/lib/fxbot/data
FXBOT_BACKUPS=/var/lib/fxbot/backups
FXBOT_CONTROL=/var/lib/fxbot/control
FXBOT_EMBED_URL=http://embed:8080/v1
```

These win over the same names in `fxbot.env`. The image sets `FXBOT_HOST=0.0.0.0` inside the container, and compose publishes its port on the machine's 127.0.0.1. `/opt/fxbot/.env` holds the install's own settings for compose, not the app's: see [What setup.sh creates](/docs/reference/install-layout/).

In a checkout, `FXBOT_EMBED_URL` names the local embedder that `deploy/compose.dev.yaml` runs, `http://127.0.0.1:8081/v1`. Without it, there is no local embedder, and memory search uses words alone unless Settings picks a provider's embedding model ([Choose where memory search's vectors come from](/docs/how-to/memory-search/)).

## Variables

<!-- the variables table from README.md -->

## The site

`npm run build-site` reads one variable of its own:

| Variable | What it is |
| --- | --- |
| `FXBOT_SITE_BASE` | The path the site is served under, such as `/fxbot/`. Default `/` |
