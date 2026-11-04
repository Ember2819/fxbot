---
title: "Your first fxbot"
description: "In this tutorial you install fxbot on a Debian or Ubuntu machine, open it on your phone, and chat with a bot you made."
---

In this tutorial you install fxbot on a Debian or Ubuntu machine, open it on your phone, and chat with a bot you made.

You need:

- a Debian 13 or Ubuntu 24.04 machine, or newer, with systemd, where you can use `sudo`. On Debian 12 or Ubuntu 22.04, first [install Docker](https://docs.docker.com/engine/install/) from Docker's repository.
- [Tailscale](https://tailscale.com/download) on that machine and on your phone, in the same tailnet, with [HTTPS turned on](https://tailscale.com/kb/1153/enabling-https). This tutorial uses it to reach fxbot from your phone, the recommended way; fxbot itself doesn't need it.
- a ChatGPT plan, or an API key from OpenAI or OpenRouter

## Install fxbot

On the machine, run:

```sh
curl -fsSL https://fxbot.sh/setup.sh | sudo bash
```

The script names each step in bold as it goes: the container engine, the fxbot user and its key, the release, and the services. fxbot runs as three containers: the app, its database, and the local embedder for memory search. The script uses podman, or docker when only docker is installed, and installs podman when neither is. Downloading the three images can take a few minutes, and the embedder downloads its model, 310 MB, on its first start. It ends with:

```
fxbot <version> runs on http://127.0.0.1:8787
Open it there. From your other devices, Tailscale is the simplest way in:  tailscale serve --bg 8787
Settings shows each new release, with an Update button. Or: sudo fxbot update
```

Ask it whether it is up:

```sh
curl http://127.0.0.1:8787/api/health
```

It answers `{"ok":true,"version":"<version>"}`. fxbot is running, but only this machine can reach it. To see its containers:

```sh
sudo fxbot status
```

It names the version, the engine, and where the local embedder runs, then lists three containers, `fxbot`, `db`, and `embed`.

## Reach it from your phone

Using fxbot only on this machine? Open `http://127.0.0.1:8787` there, and carry on at the next step. Otherwise, serve it on your tailnet:

```sh
sudo tailscale serve --bg 8787
```

Tailscale prints the address it serves, `https://<machine>.<tailnet>.ts.net`. Open that address on your phone. fxbot shows **No bots yet**.

Install it as an app:

- **Android, in Chrome:** open **Settings** at the bottom of the sidebar, and on **General**, tap **Install**.
- **iPhone:** tap **Share**, then **Add to Home Screen**, and leave Open as Web App on.

Open fxbot from the home screen. It opens on its own, without the browser's bars.

## Add a provider

Open **Settings** › **Providers**, and choose **Add provider…**, then **ChatGPT plan**.

fxbot shows a link and a code. Open the link, sign in to ChatGPT, and enter the code. The dialog closes by itself once you have, and the provider appears under Providers, marked **Default**.

With a key instead, choose **OpenAI key** or **OpenRouter key**, paste the key, and tap **Save**. fxbot checks the key with the provider before it keeps it.

## Make a bot

Tap **New bot**. Name the bot `Scout`, pick a shape and a color, and tap **Create**. As you choose, the bot in the dialog watches.

Scout's chat opens. A new bot starts on the default provider, with its default model.

## Chat

Send `Hello! What can you do?`. While Scout works, its blob in the sidebar hops and looks around, and the reply streams in as it is written.

Now close the app and open it again. The chat is still there, because it lives on the server, not in the page. A reply still being written when you leave carries on without you.

## Give it instructions

Open the bot panel with the button at the top right of the chat, then **Edit**. Under **Instructions**, write `Answer in one short paragraph.` and tap **Save**. Ask Scout something else, and notice the shorter reply.

## What you have now

A release of fxbot, served on your tailnet and installed on your phone, with a provider and a bot that keeps its chat. From here:

- [Add a skill](/docs/how-to/add-a-skill/) to give your bots instructions for a kind of task.
- [Add an MCP server](/docs/how-to/add-an-mcp-server/) to give your bots tools.
- [Serve fxbot at its own name](/docs/how-to/tailscale-service/), such as `bot.<tailnet>.ts.net`, or [reach it another way](/docs/how-to/reach-it/).
- Read about [bots, chats, memories, and the library](/docs/explanation/bots-and-chats/), and the [security model](/docs/explanation/security/).
