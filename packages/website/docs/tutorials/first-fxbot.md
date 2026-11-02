# Your first fxbot

In this tutorial you install fxbot on a Debian or Ubuntu machine, open it on your phone, and chat with a bot you made.

You need:

- a Debian or Ubuntu machine with systemd, where you can use `sudo`
- [Tailscale](https://tailscale.com/download) on that machine and on your phone, in the same tailnet, with [HTTPS turned on](https://tailscale.com/kb/1153/enabling-https). This tutorial uses it to reach fxbot from your phone, the recommended way; fxbot itself doesn't need it.
- a ChatGPT plan, or an API key from OpenAI or OpenRouter

## Install fxbot

On the machine, run:

```sh
curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash
```

The script names each step in bold as it goes: packages, Node, Postgres, the fxbot user, the release, and the service. Building the release takes a few minutes. It ends with:

```
fxbot <version> runs on http://127.0.0.1:8787
```

Ask it whether it is up:

```sh
curl http://127.0.0.1:8787/api/health
```

It answers `{"ok":true,"version":"<version>"}`. fxbot is running, but only this machine can reach it.

## Reach it from your phone

Using fxbot only on this machine? Open `http://127.0.0.1:8787` there, and carry on at the next step. Otherwise, serve it on your tailnet:

```sh
sudo tailscale serve --bg 8787
```

Tailscale prints the address it serves, `https://<machine>.<tailnet>.ts.net`. Open that address on your phone. fxbot shows **No bots yet**.

Install it as an app:

- **Android, in Chrome:** open **Settings** at the bottom of the sidebar, and tap **Install**.
- **iPhone:** tap **Share**, then **Add to Home Screen**, and leave Open as Web App on.

Open fxbot from the home screen. It opens on its own, without the browser's bars.

## Add a provider

Open **Settings**. Under Providers, choose **Add provider…**, then **ChatGPT plan**.

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

- [Add an MCP server](/docs/how-to/add-an-mcp-server/) to give your bots tools.
- [Serve fxbot at its own name](/docs/how-to/tailscale-service/), such as `bot.<tailnet>.ts.net`, or [reach it another way](/docs/how-to/reach-it/).
- Read about [bots, chats, and the library](/docs/explanation/bots-and-chats/), and the [security model](/docs/explanation/security/).
