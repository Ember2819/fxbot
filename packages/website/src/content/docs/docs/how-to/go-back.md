---
title: "Go back to an earlier release"
description: "Each release is an image, and /opt/fxbot/.env names the one that runs, in FXBOT_VERSION. Going back means naming the older version and starting it. These steps use 0.3.0; use the version you are going back to."
---

Each release is an image, and `/opt/fxbot/.env` names the one that runs, in `FXBOT_VERSION`. Going back means naming the older version and starting it. These steps use `0.3.0`; use the version you are going back to.

An update that doesn't start goes back by itself. These steps are for a release that started, which you want to leave.

## With no migration in between

The changelog says whether a release added migrations, under **Before upgrading**. If none did:

```sh
sudo sed -i 's/^FXBOT_VERSION=.*/FXBOT_VERSION=0.3.0/' /opt/fxbot/.env && sudo fxbot up
```

## After a migration

The older release refuses a database that a newer one migrated. Restore the backup taken before the migration, then switch.

1. Find the backup. Each is a folder in `/var/lib/fxbot/backups`, named for when it was taken and the first migration it came before:

   ```sh
   sudo ls /var/lib/fxbot/backups
   ```

2. Restore the database and the data folder from that folder, then name the older version and start it:

   ```sh
   sudo fxbot restore /var/lib/fxbot/backups/<date>-before-<migration>
   sudo sed -i 's/^FXBOT_VERSION=.*/FXBOT_VERSION=0.3.0/' /opt/fxbot/.env && sudo fxbot up
   ```

   `fxbot restore` stops the app first, puts the backup in place of the database, and unpacks its data folder.

   Going back from 0.4.0 or later to 0.3, restore the backup named `<date>-before-0006_plugins`. The update to 0.4.0 took it before its migrations and before it moved the chats into the database, so it holds their old files.

Anything said or saved after the backup is lost with the restore.

Why the database only moves forward: see [Releases and updates](/docs/explanation/releases/#migrations).
