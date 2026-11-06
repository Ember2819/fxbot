---
title: "Providers"
description: "The kinds of provider in Add provider\u2026, in Settings \u203a Providers. Each bot runs on one provider."
---

The kinds of provider in **Add provider…**, in **Settings** › **Providers**. Each bot runs on one provider.

| Kind | Connects with | Base URL | Models from |
| --- | --- | --- | --- |
| ChatGPT plan | Device code | | The Codex model list |
| Grok plan | Device code | | Grok's model list |
| Vercel account | Device code, then a team. Needs `FXBOT_VERCEL_CLIENT_ID`. | | AI Gateway |
| AI Gateway key | Key | | AI Gateway |
| OpenAI key | Key | `https://api.openai.com/v1` | models.dev |
| OpenCode Zen key | Key | `https://opencode.ai/inference/openai/v1` | models.dev, Chat Completions models only |
| OpenCode Go key | Key | `https://opencode.ai/inference/go/openai/v1` | models.dev, Chat Completions models only |
| OpenRouter key | Key | `https://openrouter.ai/api/v1` | models.dev |
| Ollama | Base URL, and an optional context window | `http://localhost:11434/v1` by default | The server: `/api/tags`, and `/api/show` for each model |
| LM Studio | Base URL, and an optional context window | `http://localhost:1234/v1` by default | The server: `/api/v1/models` |
| Other server | Base URL, and an optional key and context window | | The server: `/models`, ids only |

## Keys and sign-ins

- A key is checked with the provider when it is added, at its model list. It is refused when the provider answers 401 or 403, and kept on a 404, which a server with no list at `/models` gives.
- A key goes to the server once and is never sent back. A provider in the list says only whether it holds a key or a sign-in.
- A device code sign-in runs on the server. The page gets the link, the code, and when it expires.
- Keys and tokens are stored sealed. See the [security model](/docs/explanation/security/).

A new key works from the next request, even for a turn already running. **Remove** ends whatever is still running on a provider first, in any chat, and its key stops working at once.

When a provider keeps refusing, such as with a rate limit, libfx tries again by itself. After 5 minutes of nothing but refusals, fxbot stops the turn, and the chat says why. A model that's only slow is left alone.

## Model lists

- fxbot keeps each provider's model list in Postgres and answers with it at once. A list older than 5 minutes is fetched again behind that answer, and a failed fetch keeps the old list.
- A list is dropped when its source changes: a new key, address, team, or sign-in.
- models.dev is read at most once a day.
- The model picker takes a model id that the list lacks.
- A provider's **Context window**, on Ollama, LM Studio, and Other server, overrides what the server reports, for every model it serves.

## Embeddings

Memory search can take its vectors from a provider's embedding model, picked in **Settings** › **Memory** ([Choose where memory search's vectors come from](/docs/how-to/memory-search/)).

| Kind | Embeddings from |
| --- | --- |
| OpenAI key, OpenRouter key, Ollama, LM Studio, Other server | `/embeddings` under its base URL |
| AI Gateway key, Vercel account | `https://ai-gateway.vercel.sh/v1/embeddings`. A Vercel account is untested. |
| ChatGPT plan, Grok plan, OpenCode Zen key, OpenCode Go key | None |

- The model's id is typed in, as the provider names it.
- Picking one embeds a test string first. If that fails, the old setting stays.
- Removing the provider turns search by meaning off, until another is picked.
