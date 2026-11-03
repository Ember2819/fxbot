---
title: "Give bots a computer"
description: "Each bot can have a Linux computer of its own, for commands, files that last, and programs other plugins install, such as a web browser. The computer is a plugin."
---

Each bot can have a Linux computer of its own: a Debian machine where it is root, with a shell, files that last, and the programs other plugins install, such as a web browser. A bot runs commands there, reads and writes files, and saves what it makes to its library. The computer is a plugin, and the engine it runs in is set up once on the machine.

You need fxbot on Debian 13 or Ubuntu 24.04, with podman or docker: a release install has one already.

1. Open **Plugins**, choose **Browse**, and choose **computer**. Read what runs inside fxbot, then choose **Add computer**.
2. Open **Settings**. Its **Computer** section says the engine isn't set up yet, and shows a command. Choose **Read the script** to see what it does, then run the command on the machine, as root:

   ```sh
   sudo bash /var/lib/fxbot/data/plugins/computer/<commit>/host/setup.sh
   ```

   It runs this machine's podman or docker rootless, for a user of its own, `fxbot-computer`, with a firewall that keeps its computers to the internet. In a release install it restarts fxbot's container, which then reaches the engine. In a checkout, the command adds `--user <login>`, for the login that runs fxbot.
3. Open **Settings** again. The **Computer** section names the engine, such as `podman 5.4.2, rootless`.
4. The computer is on for every bot once added. To give it to some bots only, open **Plugins**, choose the pencil button on its row, and under **Bots** choose **Choose**, then switch it on for each bot that should have one.
5. Ask a bot to do something on its computer, such as "make a chart of these numbers with Python and save it to the library".

A bot's first call makes the image its computers share, which takes about half a minute, or a minute with the browser. After that a computer starts in about a tenth of a second, and stops after 15 minutes without a call. Its home, `/root`, is kept; programs a bot installs last until the computer is made again from a new image.

## Add the browser

The **browser** plugin needs the computer: add the computer first. It adds Chromium and [agent-browser](https://github.com/vercel-labs/agent-browser) to every computer, and a skill that tells bots how to open pages, read them, and take screenshots. Each computer gets it the next time it starts.

## Look after the computers

- **Settings**, under **Computer**, lists each bot's computer, running or stopped, with its home's size. **Rebuild image** makes the image again from a new copy of Debian. **Delete all computers** deletes every computer and its home.
- A bot's settings, under **Computer**, have **Stop**, and **Reset**, which deletes that bot's computer and its home.
- Removing the plugin keeps the computers and their homes. Delete them first, or run the setup command again with `--remove`, which also removes the user, its firewall, and the engine's socket.

## When it goes differently

- **The section keeps showing the command.** The engine doesn't answer at its socket. Run the command again: it says what it couldn't do. On Ubuntu 24.04 it stops when no AppArmor profile lets the engine make user namespaces; install the engine from Ubuntu's or Docker's packages, which carry one.
- **It says the engine runs as root.** The `engine` setting points at a root engine's socket, which the computer won't use. Clear the setting.
- **The image doesn't build.** The section shows the step that failed and its last lines, and the old image stays in use. A plugin's setup step may need the network: the computer's engine reaches the internet.
- **A bot can't reach something on your network.** That's the firewall: a computer reaches the internet only. See [The computer](/docs/reference/computer/) for what it refuses, and how to let one address through.

For the tools, the settings, and what a computer reaches, see [The computer](/docs/reference/computer/).
