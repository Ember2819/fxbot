---
title: "Back up fxbot"
description: "fxbot backs itself up before a release's migrations run, into /var/lib/fxbot/backups, and keeps the last five. To keep a copy of your own, off the machine, back up three things: the database, the data folder, and the key."
---

fxbot backs itself up before a release's migrations run, into `/var/lib/fxbot/backups`, and keeps the last five. To keep a copy of your own, off the machine, back up three things: the database, which holds the chats, the data folder, and the key.

These steps are for an install made by `setup.sh`. Run them in a folder only you can read, since the database holds every chat. They use podman. If `/opt/fxbot/.env` says `FXBOT_ENGINE=docker`, write `docker compose` in place of `podman compose`.

## Back up

1. Stop the app, and leave its database running, so the database and the data folder match:

   ```sh
   sudo podman compose --project-directory /opt/fxbot stop fxbot
   ```

2. Copy the database, in pg_dump's custom format, and the data folder, into a folder of their own:

   ```sh
   mkdir fxbot-backup
   sudo podman compose --project-directory /opt/fxbot exec -T db pg_dump -U fxbot -Fc fxbot > fxbot-backup/database.dump
   sudo tar -czf fxbot-backup/data.tar.gz -C /var/lib/fxbot/data .
   ```

   These are the names fxbot gives its own backups, so `fxbot restore` takes the folder as it is.

3. Start fxbot again:

   ```sh
   sudo fxbot up
   ```

4. Copy the key, and store it apart from the other two:

   ```sh
   sudo cp /etc/fxbot/secret.key fxbot-secret.key
   ```

   The database holds keys and tokens sealed with it, so they can't be opened without it. Anyone with both can open them.

## Restore

On a new machine, first install the same release with `setup.sh`, then put the key back:

```sh
sudo install -o fxbot -g fxbot -m 400 fxbot-secret.key /etc/fxbot/secret.key
```

Then restore the database and the data folder from the backup's folder, named by its full path, and start fxbot on them:

```sh
sudo fxbot restore "$PWD/fxbot-backup"
sudo fxbot up
```

`fxbot restore` stops the app, makes the database again from `database.dump`, and unpacks `data.tar.gz` into `/var/lib/fxbot/data`.
