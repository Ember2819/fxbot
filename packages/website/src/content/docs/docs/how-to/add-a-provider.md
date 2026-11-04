---
title: "Add a provider"
description: "A provider is where a bot's model runs. Open Settings \u203a Providers, choose Add provider\u2026, and pick one. What comes next depends on how it connects."
---

A provider is where a bot's model runs. Open **Settings** › **Providers**, choose **Add provider…**, and pick one. What comes next depends on how it connects.

## An account, with a device code

For **ChatGPT plan**, **Grok plan**, and **Vercel account**.

1. fxbot shows a link and a code. Open the link on any device, sign in, and enter the code.
2. Leave the dialog open. It closes by itself when the sign-in is done.
3. For a Vercel account, check the **Team** under the provider. With more than one team, pick the one to bill.

If it fails:

- A ChatGPT account or workspace must allow device code sign-in. The error says how to turn it on.
- A Vercel account needs fxbot's Vercel OAuth app, set with [`FXBOT_VERCEL_CLIENT_ID`](/docs/reference/configuration/).
- After a failed refresh, the provider's **Sign in again** starts a new sign-in.

## An API key

For **AI Gateway**, **OpenAI**, **OpenCode Zen**, **OpenCode Go**, and **OpenRouter**.

1. Paste the key, and optionally a name.
2. Tap **Save**. fxbot checks the key with the provider, and refuses one the provider rejects.

To change a key later, use the provider's **Replace key**.

## A server on your network

For **Ollama**, **LM Studio**, and **Other server**, which is any server with an OpenAI-style Chat Completions API.

1. Give its base URL, such as `http://localhost:11434/v1` for Ollama on the same machine.
2. For **Other server**, add a key if the server wants one.
3. Set **Context window** if the server reports the wrong one, as Ollama does when it runs with a shorter context than the model's.

## Then

- Pick the provider's default model from its list.
- **Make default** makes new bots start on it.
- Move a bot onto it in the bot's **Edit** page, under **Provider**.

Every kind, and what fxbot reads from it, is in [Providers](/docs/reference/providers/).
