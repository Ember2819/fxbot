# Update to a new release

For an install made by `setup.sh`. A checkout updates with git instead.

First, read the release's section of the [changelog](/docs/reference/changelog/). A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**.

## From Settings

When a newer release is out, Settings shows its notes and an **Update** button. Choose it. The machine's `fxbot` command downloads the release, lets running chats finish, and starts it, while the database keeps running. Settings shows each step, and the page reloads onto the new version once it answers.

## From a shell

```sh
sudo fxbot update
```

To install a particular release, such as a prerelease, name it:

```sh
sudo fxbot update 0.4.0-rc.1
```

## From 0.2

0.2 ran on the machine's own Node and Postgres, and its Settings can't move it into containers. Run `setup.sh` again:

```sh
curl -fsSL https://fxbot.sh/setup.sh | sudo bash
```

It stops 0.2, copies its database into `/var/lib/fxbot/backups/<date>-move-to-containers/`, restores that copy into the database container, and starts the containers on the same chats, key, and settings. The 0.2 files and database stay until you remove them. `sudo fxbot status` prints the commands.

## If it doesn't work

- **The new release didn't download.** fxbot stays on the running one, and says why.
- **Another update is running.** Settings says so. From a shell, the second update waits for the first.
- **The new release doesn't start.** Within 5 minutes, fxbot goes back to the release it was on, and restores the backup the new release took before its migrations, if it ran any. Settings shows why. Read more with `sudo fxbot logs fxbot`.
- **fxbot doesn't start after going back.** Read `sudo fxbot logs`, then [go back](/docs/how-to/go-back/) by hand.

What an update does, step by step, is in [Releases and updates](/docs/explanation/releases/).
