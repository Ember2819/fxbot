# Security model

fxbot is built for one person's machine, where agents may run too. It keeps every secret on the server, sealed, and leaves who reaches it to you. This page is about why it works that way, and where its edges are.

## Loopback only, with no login

fxbot listens on 127.0.0.1 and has no accounts, so what sits in front of it decides who gets in. On the machine itself, that is whoever uses that machine. Through Tailscale, the recommended way in, it is your tailnet's access rules: Tailscale already knows each device and each person, so a second login in fxbot would be one more password guarding the same door, and a weaker one.

The cost is that whoever reaches the address can use all of fxbot: every bot, every chat, every provider. So fxbot should never be open to a network directly, through port forwarding or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), and any other way in, such as a reverse proxy, needs a login of its own ([Reach it from other devices](/docs/how-to/reach-it/)).

## Keys sealed in Postgres

Every key and token fxbot stores is sealed in the SDK with AES-256-GCM before it reaches Postgres, with a fresh nonce each time, and bound to the record it belongs to. Postgres holds only ciphertext and never sees the key. fxbot doesn't use pgcrypto, whose key would travel inside SQL and could reach Postgres's logs.

The key is a file, `/etc/fxbot/secret.key` in a release install, that only the server's user reads. Tools such as fx and opencode keep sign-ins in a file with mode 600, which any agent running as the same user can read. fxbot puts its secrets where such an agent can't.

`npm run rotate-key` seals everything again under a new key, for when the old one may have leaked. See [Commands](/docs/reference/commands/#npm-run-rotate-key).

## Nothing secret on the page

The page sends a key once, and never gets it back: a provider in a list says only whether it has a key or a sign-in. Device code and OAuth sign-ins run on the server, as attempts the page checks on. The page sees a link and a code, and never a verifier or a token.

The page's code carries no credentials, and its build reads no `.env`. A page left open, a browser extension, or the app's offline copy holds nothing worth taking.

## Agents on their own user

Coding agents and other tools may run on the same machine, as your user or one of their own. A release install runs as the `fxbot` user, which alone reads the key in `/etc/fxbot`, the chats in `/var/lib/fxbot`, and reaches the `fxbot` database, through Postgres's peer auth. An agent running as any other user that isn't root reaches none of them.

Root reaches everything, and fxbot doesn't try to defend against it. A checkout run as yourself doesn't have this separation either: its key and database are yours, so any agent running as you can read them. That is why everyday use is a release install.

## Files served as data

The library serves what chats hold as data, never as a page. Images are checked from their bytes. Documents are served as plain text, with `nosniff` and a sandbox that runs nothing, even opened in a tab of their own. HTML and SVG are never served as themselves.

## MCP servers

A remote MCP server's tools are code fxbot doesn't control, and a call may not be safe to run twice. Until fxbot can ask before a tool call, bots get only a server's read-only tools, until you allow others by name.

Adding a server makes fxbot's server fetch its address. So fxbot takes HTTPS only, and refuses local and private addresses, the tailnet's included, unless you allow one for a server you run. A server's key, headers, and OAuth client are sealed like a provider's.

## What it doesn't cover

- Each message goes to the provider its bot uses, which sees the chat. Only a local model server keeps it on your network.
- There are no users, roles, or audit log inside fxbot.
- The backups taken before migrations hold the database and the chat files, readable only by `fxbot`. The secrets in them stay sealed.
