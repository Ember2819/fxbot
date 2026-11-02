# Back up fxbot

fxbot backs itself up before a release's migrations run, into `/var/lib/fxbot/backups`, and keeps the last five. To keep a copy of your own, off the machine, back up three things: the database, the chat files, and the key.

These steps are for an install made by `setup.sh`. Run them in a folder only you can read, since the database holds every chat.

## Back up

1. Stop fxbot, so the database and the chat files match:

   ```sh
   sudo systemctl stop fxbot
   ```

2. Copy the database, in pg_dump's custom format, and the chat files:

   ```sh
   sudo -u fxbot pg_dump --format=custom fxbot > fxbot.dump
   sudo tar -czf fxbot-data.tar.gz -C /var/lib/fxbot/data .
   ```

3. Start fxbot again:

   ```sh
   sudo systemctl start fxbot
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

Then restore the database and the chat files:

```sh
sudo systemctl stop fxbot
sudo -u fxbot pg_restore --clean --if-exists -d fxbot < fxbot.dump
sudo tar -xzf fxbot-data.tar.gz -C /var/lib/fxbot/data
sudo systemctl start fxbot
```
