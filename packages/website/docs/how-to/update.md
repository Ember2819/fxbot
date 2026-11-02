# Update to a new release

For an install made by `setup.sh`. A checkout updates with git instead.

First, read the release's section of the [changelog](/docs/reference/changelog/). A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**.

## From Settings

When a newer release is out, Settings shows its notes and an **Update** button. Choose it. fxbot builds the new release, switches to it, lets running chats finish, and restarts. The page then offers **Reload**.

## From a shell

```sh
cd /opt/fxbot/current && sudo -u fxbot -H npm run update
sudo systemctl restart fxbot
```

To install a particular release, such as a prerelease, name it:

```sh
cd /opt/fxbot/current && sudo -u fxbot -H npm run update -- v0.2.0-rc.1
```

## If it doesn't work

- **The new release didn't build.** fxbot stays on the running one, and says why.
- **Another update is running.** Wait for it to finish.
- **fxbot doesn't start after the restart.** Read `journalctl -u fxbot`, then [go back](/docs/how-to/go-back/).

What an update does, step by step, is in [Releases and updates](/docs/explanation/releases/).
