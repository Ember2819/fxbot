# Security model

fxbot is built for one person's machine. It keeps every secret on the server, sealed, and leaves who reaches it to you. This page is about why it works that way, and where its edges are.

## Loopback only, with no login

fxbot listens on 127.0.0.1 and has no accounts, so what sits in front of it decides who gets in. On the machine itself, that is whoever uses that machine. Through Tailscale, the recommended way in, it is your tailnet's access rules: Tailscale already knows each device and each person, so a second login in fxbot would be one more password guarding the same door, and a weaker one.

The cost is that whoever reaches the address can use all of fxbot: every bot, every chat, every provider. So fxbot should never be open to a network directly, through port forwarding or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), and any other way in, such as a reverse proxy, needs a login of its own ([Reach it from other devices](/docs/how-to/reach-it/)).

## Keys sealed in Postgres

Every key and token fxbot stores is sealed in the SDK with AES-256-GCM before it reaches Postgres, with a fresh nonce each time, and bound to the record it belongs to. Postgres holds only ciphertext and never sees the key. fxbot doesn't use pgcrypto, whose key would travel inside SQL and could reach Postgres's logs.

The key is a file, `/etc/fxbot/secret.key` in a release install, that only the server's user reads.

`npm run rotate-key` seals everything again under a new key, for when the old one may have leaked. See [Commands](/docs/reference/commands/#npm-run-rotate-key).

## Nothing secret on the page

The page sends a key once, and never gets it back: a provider in a list says only whether it has a key or a sign-in. Device code and OAuth sign-ins run on the server, as attempts the page checks on. The page sees a link and a code, and never a verifier or a token.

The page's code carries no credentials, and its build reads no `.env`.

## Files served as data

The library serves what chats hold as data, never as a page. Images are checked from their bytes. Documents are served as plain text, with `nosniff` and a sandbox that runs nothing, even opened in a tab of their own. HTML and SVG are never served as themselves.

## MCP servers

A remote MCP server's tools are code fxbot doesn't control, and a call may not be safe to run twice. Until fxbot can ask before a tool call, bots get only a server's read-only tools, until you allow others by name.

Adding a server makes fxbot's server fetch its address. So fxbot takes HTTPS only, and refuses local and private addresses, the tailnet's included, unless you allow one for a server you run. A server's key, headers, and OAuth client are sealed like a provider's.

A registry entry says who published it, checked by the registry, but not that its server is safe or theirs. Its page shows the server's host, in red when it isn't on the publisher's domain, and nothing is saved before **Add**. If the entry changes between the page and **Add**, fxbot refuses and shows the page again. fxbot fetches GitHub's MCP registry every hour, its own list of servers when an address for it is set, and the official registry only when you tick **Search everything**, which sends it your search words. It loads no icons from them.

## Skills

A skill is someone else's instructions, which a bot follows like its own. fxbot shows a skill's `SKILL.md` before you add it, and keeps it pinned to the commit of its repository that page came from. When its files change there, it waits for you to update it. Nothing in a skill runs: fxbot keeps only its text files, and bots read its scripts as text. Each skills search on the Skills tab sends its words to skills.sh, and adding a skill fetches its repository from GitHub.

## What it doesn't cover

- Each message goes to the provider its bot uses, which sees the chat. Only a local model server keeps it on your network.
- There are no users, roles, or audit log inside fxbot.
- The backups taken before migrations hold the database and the chat files, readable only by `fxbot`. The secrets in them stay sealed.
