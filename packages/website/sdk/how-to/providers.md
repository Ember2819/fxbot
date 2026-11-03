# Connect providers

A provider is where a bot's model runs. Your backend adds one with `fxbot.providers`, or with `fxbot.signIns` for an account. Every kind, and what fxbot reads from it, is in [Providers](/docs/reference/providers/).

## A server on your network

For `ollama`, `lmstudio`, and `custom`, which is any server with an OpenAI-style Chat Completions API.

```ts
const local = await fxbot.providers.add({ kind: "ollama", model: "qwen3:8b" });
```

- Ollama and LM Studio default to their usual address on this machine. Give `baseUrl` for another, such as `http://192.168.1.20:11434/v1`. A `custom` server needs one.
- An address must use `https`, or `http` on localhost.
- `apiKey` is for a `custom` server that wants a key.
- `contextWindow` overrides the context window the server reports, for every model it serves.

The server must be running: `add` asks it for its models first.

## An API key

For `openai`, `gateway`, `openrouter`, `opencode`, and `opencode-go`.

```ts
const openai = await fxbot.providers.add({ kind: "openai", apiKey: process.env.OPENAI_API_KEY!, model: "gpt-5" });
```

`add` checks the key with the provider, and refuses one the provider rejects. Then the SDK seals the key in Postgres. A listed provider says only `hasKey: true`, never the key.

To change a key, update it. It's checked again:

```ts
await fxbot.providers.update(openai.id, { apiKey: newKey });
```

## An account, with a device code

For `chatgpt`, `grok`, and `vercel`. The person signs in on any device, and the SDK claims the tokens on your backend.

1. Start the sign-in, and show its link and code:

   ```ts
   const signIn = await fxbot.signIns.start({ kind: "chatgpt" });
   console.log(`Open ${signIn.verificationUrl} and enter ${signIn.userCode}`);
   ```

2. Ask how it's going until it's done. A finished sign-in names the new provider:

   ```ts
   import { setTimeout as sleep } from "node:timers/promises";

   let provider: string | undefined;
   while (!provider) {
     await sleep(2000);
     const status = fxbot.signIns.get(signIn.id);
     if (status.status === "failed") throw new Error(status.error);
     provider = status.provider;
   }
   ```

3. For a Vercel account with more than one team, pick the team to bill:

   ```ts
   const teams = await fxbot.providers.teams(provider);
   await fxbot.providers.update(provider, { teamId: teams[0].id });
   ```

One sign-in runs at a time: a new one replaces one still waiting. `signIns.cancel(id)` stops one. To sign in again to a provider you have, as after a failed refresh, pass its id: `signIns.start({ kind: "chatgpt", provider: id })`.

A Vercel account needs fxbot's Vercel OAuth app: pass its id to `createFxbot` as `vercelClientId`.

## Then: models and bots

1. List the provider's models, and pick its default model:

   ```ts
   const models = await fxbot.providers.models(openai.id); // ids, and a context window when known
   await fxbot.providers.update(openai.id, { model: "gpt-5" });
   ```

2. Make it the default provider, so new bots start on it:

   ```ts
   await fxbot.settings.update({ defaultProvider: openai.id });
   const bot = await fxbot.profiles.create({ name: "Scout" });
   ```

   Or give a bot its provider, and a model of its own, when you make it: `profiles.create({ name, provider, model })`. A bot with no model follows its provider's default.

3. To move a bot to another provider, update it:

   ```ts
   await fxbot.profiles.update(bot.id, { provider: local.id, model: "qwen3:8b" });
   ```

   A bot with a chat starts a new one there, from a summary of the old one. See [Moving a bot to another provider](/docs/explanation/bots-and-chats/#moving-a-bot-to-another-provider).

`providers.remove(id)` removes a provider that no bot uses.

## From a page

The client has the same calls over fxbot's HTTP API: `client.providers.add(...)`, `client.signIns.start(kind)`, and `client.signIns.get(id)`. A key goes up to the server once and never comes back. See [Build a page on the client](/sdk/how-to/web-page/).

## If it doesn't work

- **`add` says the provider rejected this key.** It answered 401 or 403. Check the key, and that it's for that kind.
- **`add` can't reach a server on your network.** Start the server first, and check `baseUrl`. Ollama's ends in `/v1`.
- **`signIns.start` asks for `FXBOT_VERCEL_CLIENT_ID`.** Pass `vercelClientId` to `createFxbot`.
- **A ChatGPT sign-in fails.** The account or workspace must allow device code sign-in. The error says how to turn it on.
- **`send` says there's no model.** Give the provider a default model, as in step 1, or give the bot one.
- **`send` says the bot has no provider.** Set a default provider before you make bots, or give each bot one.
- **`providers.remove` says bots use the provider.** Move them to another provider first.
