---
title: "Give bots a computer"
description: "Each bot can have a Linux computer of its own, with a desktop you watch and take over, a terminal, a web browser, and files that last. The computer is a plugin."
---

Each bot can have a Linux computer of its own: a Debian machine where it is root, with a desktop, a terminal, Chromium, and files that last. A bot runs commands there, browses, works in desktop apps, and saves what it makes to its library. You watch its desktop as it works, and take it over when it needs you. The computer is a plugin, and the engine it runs in is set up once on the machine.

You need fxbot on Debian 13 or Ubuntu 24.04, with podman or docker: a release install has one already.

1. Open **Plugins**, choose **Browse**, and choose **computer**. Read what runs inside fxbot, then choose **Add computer**.
2. The machine sets up the computer's engine by itself, in a minute or two: this machine's podman or docker, run rootless for a user of its own, `fxbot-computer`, with a firewall that keeps its computers to the internet. fxbot starts again when it's done. **Settings** › **Computer** shows it working, then names the engine, such as `podman 5.4.2, rootless`.
3. The computer is on for every bot once added. To give it to some bots only, open **Plugins**, choose the pencil button on its row, and under **Bots** choose **Choose**, then switch it on for each bot that should have one.
4. Ask a bot to do something on its computer, such as "make a chart of these numbers with Python and save it to the library", or "find the opening hours on the library's site". To point it at the computer, choose the screen button beside the message box, which adds `$computer` to the message.

A bot's first call makes the image its computers share, which takes a minute or two. After that a computer and its desktop start in about a second, and stop after 15 minutes without a call. Its home, `/root`, is kept, with the browser's sign-ins; programs a bot installs last until the computer is made again from a new image.

## Watch and take over

Open a bot's computer from the dot on its screen button, which shows while the computer runs, or with **Open computer** in the bot's settings or in **Settings**. Its screen has two tabs:

- **Desktop** shows the computer's screen as the bot works, with Chromium, a file manager, and a terminal window. It's for watching: a click there does nothing.
- **Terminal** is the same terminal as the window on the desktop, the one the bot types in with `computer_terminal`. What you type there reaches it too.

To use the desktop yourself, choose **Take over**. The mouse and keyboard are yours, and the bot's desktop and terminal tools wait; its shell and file tools go on. Choose **Hand back** when you're done. Closing the screen hands it back too. A computer someone watches doesn't stop while it's open.

When a bot needs you for something only you can do, such as a sign-in, a passkey, or a CAPTCHA, it asks: the dot turns orange, and the computer's screen says what it needs. Do it, then choose **Hand back**. The bot hears, looks at the screen, and carries on.

## The browser

Chromium is on each computer's desktop. Bots drive it with [agent-browser](https://github.com/vercel-labs/agent-browser), and you see each page they open. It starts the first time a bot uses it.

## Look after the computers

- **Settings** › **Computer** lists each bot's computer, running or stopped, with its home's size. **Rebuild image** makes the image again from a new copy of Debian. **Delete all computers** deletes every computer and its home.
- A bot's settings, under **Computer**, have **Stop**, and **Reset**, which deletes that bot's computer and its home.
- Removing the plugin keeps the computers, their homes, and the engine. Delete the computers first, or, after removing it, run `sudo fxbot computer off`, which also removes the user, its firewall, and the engine's socket. In a checkout, run the setup script with `--remove`.

## When it goes differently

- **The setup failed.** Settings shows why, with **Try again**. On Ubuntu 24.04 it stops when no AppArmor profile lets the engine make user namespaces; install the engine from Ubuntu's or Docker's packages, which carry one.
- **The section shows a command.** fxbot runs from a checkout as a user other than root, so nothing it runs can set up the engine. Run the command on the machine, as root. Choose **Read the script** to see what it does first.
- **It says the engine runs as root.** The `engine` setting points at a root engine's socket, which the computer won't use. Clear the setting.
- **The image doesn't build.** The section shows the step that failed and its last lines, and the old image stays in use. A plugin's setup step may need the network: the computer's engine reaches the internet.
- **A bot can't reach something on your network.** That's the firewall: a computer reaches the internet only. See [The computer](/docs/reference/computer/) for what it refuses, and how to let one address through.
- **The desktop stays on Connecting….** The computer is starting, or its desktop stopped. Choose **Connect again**. If the screen says the computer is stopped, choose **Start it**.
- **Chinese, Japanese, or Korean text, or emoji, shows boxes.** The image has no fonts for them. A plugin that needs the computer can add them with a setup step, such as `apt-get install -y fonts-noto-cjk fonts-noto-color-emoji`.

For the tools, the skills, the settings, and what a computer reaches, see [The computer](/docs/reference/computer/).
