# Configuration

fxbot's server reads its settings from environment variables. None of them is a secret: the key that seals secrets is a file, named by `FXBOT_SECRET_KEY_FILE`.

## Where they are set

| Install | Where | Read by |
| --- | --- | --- |
| A release, from `setup.sh` | `/etc/fxbot/fxbot.env`, owned by `fxbot`, mode 600 | `fxbot.service`, as its `EnvironmentFile`. A change takes effect at the next restart. |
| A checkout | The environment, or `.env` in the repository root. The environment wins. | The server and its commands. Vite reads no `.env`. |

The file `setup.sh` writes, with the Postgres cluster's own port:

```sh
FXBOT_DATABASE_URL=postgres:///fxbot
PGHOST=/var/run/postgresql
PGPORT=5432
FXBOT_SECRET_KEY_FILE=/etc/fxbot/secret.key
FXBOT_DATA=/var/lib/fxbot/data
FXBOT_BACKUPS=/var/lib/fxbot/backups
```

## Variables

<!-- the variables table from README.md -->

`PGHOST` and `PGPORT` are Postgres's own: the folder of its socket, and its port.

## The site

`npm run build-site` reads one variable of its own:

| Variable | What it is |
| --- | --- |
| `FXBOT_SITE_BASE` | The path the site is served under, such as `/fxbot/`. Default `/` |
