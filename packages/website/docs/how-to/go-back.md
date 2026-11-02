# Go back to an earlier release

An update keeps the release it replaced in `/opt/fxbot/releases/`. Going back means pointing `current` at it. These steps use `v0.1.0`; use the tag you are going back to.

## With no migration in between

The changelog says whether a release added migrations, under **Before upgrading**. If none did:

```sh
sudo ln -sfn releases/v0.1.0 /opt/fxbot/current && sudo systemctl restart fxbot
```

## After a migration

The older release refuses a database that a newer one migrated. Restore the backup taken before the migration, then switch.

1. Find the backup. Each is a folder in `/var/lib/fxbot/backups`, named for when it was taken and the first migration it came before:

   ```sh
   sudo ls /var/lib/fxbot/backups
   ```

2. Stop fxbot, restore the database and the chat files from that folder, and switch:

   ```sh
   sudo systemctl stop fxbot
   sudo -u fxbot pg_restore --clean --if-exists -d fxbot /var/lib/fxbot/backups/<date>-before-<migration>/database.dump
   sudo -u fxbot tar -xzf /var/lib/fxbot/backups/<date>-before-<migration>/data.tar.gz -C /var/lib/fxbot/data
   sudo ln -sfn releases/v0.1.0 /opt/fxbot/current && sudo systemctl start fxbot
   ```

Anything said or saved after the backup is lost with the restore.

Why the database only moves forward: see [Releases and updates](/docs/explanation/releases/#migrations).
