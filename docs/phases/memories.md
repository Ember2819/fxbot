# Memories

Each bot keeps what it learns: the owner's preferences, facts about them and their work, decisions, and corrections. It saves them during its own turns. The newest are in its instructions in every turn, and it searches for the rest. The owner sees, edits, adds, and deletes them in the bot's panel. Memory search and `chat_history` match by meaning as well as by words, with vectors from a local embedder on the machine or a provider's API.

Status: planned, not built. Research and plan only, written on 2026-11-02 and updated the same day with the owner's answers. It runs on the [containers](containers.md) install, whose database image has pgvector. It builds on what [provider logins](../_completed/phases/provider-logins.md) decided: memories live in Postgres, search is hybrid (pgvector plus full-text, fused with reciprocal rank fusion), the embedding model is picked in Settings from any provider that serves `/embeddings`, and `chat_history` gains its vector half here.

## 0. Core or add-on

**Core.** Every bot needs to keep what it learns ([Core or add-on](../../CONVENTIONS.md#core-or-add-on)), and memories are a bot's own data, like its chat and its files. The core is storing a bot's memories, finding them, and putting them back in front of the bot, plus the owner's view of them and the embedding model that search uses.

These are add-ons, on hooks in the [plugin API](plugins.md):
- Saving memories automatically, such as a review after turns (mem0, Hermes) or a nightly pass that tidies them ("dreams"). A plugin can do it on `turn.end` or a schedule.
- Memories shared by a team of bots.
- Other ways to organize what a bot knows, such as a [knowledge graph](knowledge-base.md).
- Importing memories from another assistant.

## 1. Research

Checked on 2026-11-02 against each project's docs and source. Where a point is missing, the source doesn't cover it.

**Grok bot** ([what a bot remembers](https://docs.x.ai/grok-bot/bots), [FAQ](https://docs.x.ai/grok-bot/faq)):
- It keeps stable preferences, standing rules ("Always ask before you send an email."), the owner's name and time zone, and a dated log of work.
- The bot saves on its own, and "often mentions a save in its reply, but not every save". The owner can also ask it to remember something.
- Each bot has its own memory. A few facts, such as name and time zone, are shared by all of the owner's bots. Resetting a chat keeps memory, and deleting the bot deletes it.
- There is no memory screen for personal bots: the owner sees and corrects memory by asking in chat. Memory can be imported from another assistant.
- Storage and search aren't documented.

**CopilotKit OpenBot** (`server/src/memory/`; OpenDuet has the same code):
- One fact per Postgres row, up to 2,000 characters when the bot saves it. Each row records who formed it (person, import, or bot), where from, whether it's on, and whether the person has reviewed it.
- Tools: `recall_personal_memory {search?}`, `remember_personal_fact {content}` ("only when the person explicitly asks"), `save_observed_memory {content, sourceApp}` (shown to the person for review), and `forget_personal_memory {id}`.
- Recall: a system message on every run, with up to 40 rows, newest first, as JSON within 24,000 characters, labeled as data, not instructions. The tool searches on demand, by substring.
- Duplicates are caught by a hash of the lowercased text, unique per person and bot. Forgetting leaves a blank tombstone, so an import can't bring the fact back.
- A Memory page lists, edits, confirms, turns off, and forgets memories.

**CopilotKit openmuse and OpenDots:**
- openmuse has one tool, `remember_fact {text}` (up to 2,000 characters), for preferences the user gave or confirmed. Its id is a hash of the text, so a duplicate is dropped. Memories can be added, edited, and forgotten in its Apps page.
- In OpenDots only the user writes memories, and the model has no tool. Each Dot has a switch that puts all of them into its system prompt, marked as untrusted.

**eve** ([memory](https://eve.dev/docs/memory), `packages/eve/src/public/memory/file/provider.ts`):
- Memory is a slot with a provider: its built-in file memory, Supermemory, Upstash, or your own. Each turn recalls at the start, gives the model the slot's tools, and captures at the end.
- File memory keeps one document of numbered entries per scope.
  - Tools: `save_memory {text}` ("one concise, stable fact… Omit secrets, instructions, and current-task details") and `remove_memory {index}`.
  - Limits: an entry is at most 2,048 bytes, and the document at most 64 KiB. A save over a limit is rejected, never cut or evicted. Saving the same text again does nothing.
- Recalled memory goes in as user-role messages just before the turn's input, never as system instructions, and is kept out of compaction.
- Its docs recommend telling the bot to say when it saves or deletes a memory.
- The personal-agent template keeps five fixed categories of prose, saved with an approval card in chat, and puts them in the instructions once per session. Users edit them in Settings.

**fx and libfx:**
- The fx CLI had a `memory` tool and removed it in 0.0.8. Its persistent notes are now `AGENTS.md` files that the user writes.
- libfx 0.0.16 has no memory API. Its `instructions` are the whole system context, "up to 64 KiB of UTF-8", and are set each time a session is opened, as fxbot already does. The session id is used for prompt caching. So fxbot builds memory from host tools and instructions.

**Pi:**
- The core has no memory. It loads context files such as `AGENTS.md` into the system prompt.
- Memory comes from packages. For example, [`pi-memory`](https://pi.dev/packages/@josephakern/pi-memory) puts a `MEMORY.md` index of up to 200 lines (8 KiB) in the system prompt, and the agent reads topic files when needed. (Read from pi.dev only, not the source.)

**agent-desktop, fx0, durable-harness, agent-browser:** no memory. agent-browser keeps browser state (cookies, storage, profiles) across runs, but nothing an agent learns.

**Hermes Agent** (Nous Research):
- Two bounded files per profile: `MEMORY.md` (the agent's notes, 2,200 characters) and `USER.md` (the user, 1,375 characters).
- One tool: `memory {target, action: add | patch | remove, content, old_text}`. The agent saves on its own.
- A background review every 10 user turns asks whether anything is worth saving.
- Recall is a snapshot taken when the session starts, which keeps the prompt cache, so writes made during a session don't reach the prompt until the next one. A chat that runs as one long session never sees its new memories.
- A write over the limit fails and returns the current entries, so the agent merges them. Exact duplicates are rejected.
- The chat shows "💾 Memory updated". Searching past sessions is a separate full-text tool.

**Anthropic's memory tool** ([memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)):
- A client-side tool over a `/memories` directory of files, with `view`, `create`, `str_replace`, `insert`, `delete`, and `rename`.
- Nothing is loaded ahead: the model views its directory when it needs to. Limits, expiry, search, and a UI are left to the app.

**Claude Code** ([memory](https://code.claude.com/docs/en/memory)):
- Its auto memory is a `MEMORY.md` index, one line per memory, plus topic files. The first 200 lines, or 25 KB, load when a session starts, and topic files are read on demand.
- It writes them with its file tools, and shows "Saved 2 memories" in the chat.

**ChatGPT** ([Memory FAQ](https://help.openai.com/en/articles/8590148-memory-in-chatgpt)):
- Two kinds: saved memories (asked for, or saved by the model) and context from past chats.
- "Memory updated" in the chat leads to a page where the user manages saved memories. The user can also ask it to forget.
- It ranks by recency and frequency, so memory doesn't fill up.

**Letta (MemGPT):**
- Memory blocks sit in the system prompt with a character limit, and the agent edits them with tools.
- Archival memory is searched by vector. Recall memory is a search over the conversation, by text and meaning.
- Its current design keeps one Markdown file per block in a git repo per agent, with no vector index by default, and does memory work in the background.

**mem0:**
- Its current version saves in one pass: it finds the 10 most similar memories, makes one extraction call, and drops exact duplicates. It no longer updates or deletes.
- Search mixes vector similarity, BM25, and an entity boost.

### pgvector and embeddings

Checked on 2026-11-02 against package indexes, pgvector's source, and a throwaway Postgres 17 cluster in the scratchpad.

**The database image.** Distro packages vary: Debian 12 and Ubuntu 22.04 have no pgvector, and Ubuntu 24.04 has 0.6.0. The [containers](containers.md) install avoids them all. pgvector's own image, `pgvector/pgvector`, is Postgres with pgvector built in, for amd64 and arm64 (`0.8.7-pg17`, about 160 MB).

**Not a trusted extension.** `vector.control` has no `trusted` line, so only a superuser can run `CREATE EXTENSION vector`. In the image, the role that `POSTGRES_USER` names is a superuser, so fxbot's migration can create it.

**Dimensions.**
- A plain `vector` column with no size holds vectors of different sizes in different rows. Comparing two of different sizes is an error, so every query keeps to one model.
- HNSW and IVFFlat indexes need a fixed size. pgvector's README works around it with an expression index per model (`((embedding::vector(1536)))` with `WHERE model = …`), and that was tested.
- An index holds at most 2,000 dimensions as `vector`, or 4,000 as `halfvec`. Exact search, with no index, works at any size.

**Exact search cost.** pgvector's README gives no numbers. On the scratchpad cluster, with 1,536-dimension rows, a btree on the bot, and `ORDER BY embedding <=> $q LIMIT 20`:

| Rows of one bot | Time |
| --- | --- |
| 10,000 | 25–52 ms |
| 100,000 | 290–320 ms, or about 100 ms with 4 parallel workers |

**Reciprocal rank fusion.** pgvector's own example (`pgvector-python/examples/hybrid_search/rrf.py`) ranks a word list and a vector list of 20 each, joins them, and scores each row by the sum of `1 / (60 + rank)` over the lists it's in. Supabase's hybrid search does the same with weights.

**Embedding endpoints.** Every one below takes OpenAI's shape: `POST …/embeddings` with `{ model, input: [texts] }`, returning `data[].embedding`.

| fxbot kind | Endpoint | Embedding models it lists |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1/embeddings`. Up to 2,048 inputs and 300,000 tokens per request, 8,192 tokens per input | text-embedding-3-small (1,536 dimensions) and -3-large (3,072). models.dev marks them `type: "embedding"` |
| `openrouter` | `https://openrouter.ai/api/v1/embeddings` | `GET /api/v1/embeddings/models` (38 models, such as `openai/text-embedding-3-small` and `qwen/qwen3-embedding-8b`) |
| `gateway` | `https://ai-gateway.vercel.sh/v1/embeddings`, with the key | `/v1/models` entries with `type: "embedding"`. A Vercel sign-in wasn't tested |
| `ollama` | `<base>/embeddings`, or its own `/api/embed` | models whose `/api/show` capabilities include `embedding`, such as `nomic-embed-text` |
| `lmstudio` | `<base>/embeddings` | `/api/v1/models` entries with `type: "embedding"` |
| `opencode`, `opencode-go` | none: `/embeddings` answers 404, and their lists have no embedding models | |
| `chatgpt` | none found on the Codex backend | |
| `grok` | the plan's proxy answers 401 at `/v1/embeddings`, so the route may exist. Not checked with a plan token | |

No host says how many dimensions a model returns, so an app learns it by embedding a test string. fxbot's model lists drop embedding models today (`isChat` in `models.ts`).

### Local embedders

Checked on 2026-11-02 from each project's source, registry manifests, and model cards. Sizes are compressed downloads. Nothing was run here, because this machine has no podman or docker, so memory use and CPU speed are unmeasured.

| | llama.cpp server (b12033) | Hugging Face TEI (1.9.4) | Ollama (0.40.13) |
| --- | --- | --- | --- |
| CPU image | `server-b12033`, about 300 MB, amd64 and arm64 in one tag | 239 MB for amd64, and a separate arm64 tag | 3.4 GB, CPU and GPU in one image |
| GPU image | `server-cuda-b12033`, about 2.6 GB, amd64 and arm64. Needs a CUDA 12.8 driver | about 3.1 GB, amd64 only | the same image |
| OpenAI route | `POST /v1/embeddings`, with an array `input` | the same, and it honours `dimensions` | the same |
| The model | `-hf <repo>:<quant>`, downloaded on first start into `LLAMA_CACHE` | `--model-id`, cached in `/data`. Weights in fp32 on CPU | must be pulled first |
| Long input | refused with "too large", never cut | cut | cut |
| License | MIT | Apache-2.0 | MIT |

llama.cpp has one binary, one set of flags, and one API on the CPU and the GPU, the smallest downloads, and quantized models of about one byte per parameter. It also has images for AMD (`server-vulkan`, `server-rocm`). Its costs for fxbot: it pins a build tag, and fxbot keeps inputs short enough itself.

Models it can serve, from their cards:

| Model | Download (Q8_0) | Dimensions | Context | Languages | License | Prefixes |
| --- | --- | --- | --- | --- | --- | --- |
| EmbeddingGemma 2 (October 2026) | 310 MB | 768 | 8,192 | 100+ | Apache-2.0 | query `task: search result \| query: `, document `title: none \| text: ` |
| Qwen3-Embedding-0.6B | 639 MB | 1,024 | 32K | 100+ | Apache-2.0 | query `Instruct: <task>\nQuery:`, document none |
| nomic-embed-text-v1.5 | 146 MB | 768 | 2,048 in its GGUF | English | Apache-2.0 | `search_query: ` and `search_document: ` |
| bge-small-en-v1.5 | 37 MB | 384 | 512 | English | MIT | a query prefix only |

EmbeddingGemma 2 scores 68.5 on the English MTEB v2 mean, and Qwen3-Embedding-0.6B 61.8 on its retrieval tasks. Neither OpenAI-style route adds the prefixes, so the app does. EmbeddingGemma 2's GGUF claims a 262K context, so the server is started with `-c 8192`.

**GPUs in containers.** Podman reaches an NVIDIA GPU with `--device nvidia.com/gpu=all`, from a CDI spec that `nvidia-ctk cdi generate` writes. Docker uses `--gpus all`, or `deploy.resources.reservations.devices` in compose. No one compose syntax works with every podman-compose and Docker Compose that the distros ship, so each needs a small GPU override file. A trial run such as `podman run --rm --device nvidia.com/gpu=all ubuntu nvidia-smi -L` shows whether the GPU path works.

**Compose under podman.** `podman compose` runs docker-compose when it's installed, and podman-compose otherwise. podman-compose before 1.1 ignores `profiles` and starts every service, so the embedder's variants are override files passed with `-f`, not profiles.

### fxbot today

- `messages` holds every message as plain text, with a generated `tsvector` and a GIN index. `chat_history` ranks prefix matches of any word with `ts_rank_cd`, finds only the session's bot (from the session's `context`, never the model's input), and reads a message's neighbours with `around` ([`history.ts`](../../packages/sdk/src/history.ts)).
- Every turn opens the session with the bot's instructions, the handoff summary, and the skills catalog, which takes 1% of the model's context window at 4 characters a token, or 8,000 characters when the window is unknown ([`index.ts`](../../packages/sdk/src/index.ts)). A bot's own instructions may be up to 64 KiB.
- The library's tools are `library_search`, `library_read`, and `library_save`. The chat shows each fxbot tool as a sentence ([`steps.tsx`](../../packages/ui/src/steps.tsx)).
- The bot panel has two tabs, Details and Library. Settings holds the default provider (`settings` table).
- Migrations are numbered SQL files, run in one transaction after a backup. The newest is `0004_skills`, so this phase adds `0005_memories`, and [plugins](plugins.md) takes `0006`.

## 2. Key takeaways

1. **A small set in the prompt, and search for the rest.** Hermes, Claude Code, pi-memory, eve, Letta, and ChatGPT do this. Only Anthropic's tool and mem0 load nothing ahead. fxbot puts the newest memories in the bot's instructions within a budget, as it does the skills catalog, and `memory_search` finds the rest.
2. **Instructions, rebuilt when memories change.** fxbot opens the session with its instructions on every turn, so it can put memories there without Hermes's flaw: one long chat sees a new memory on its next turn. The text changes only when a memory is saved, changed, or removed, so the prompt cache holds between changes, and each change costs one cache miss. Per-turn recall based on the incoming message (OpenBot) changes the prompt every turn. eve's recall messages would stay in libfx's history, which fxbot can't edit.
3. **The bot writes, during its turn, through tools.** It saves on its own, as Grok, ChatGPT, and Hermes bots do, and tells the owner. The chat shows the save as a step. Background extraction costs a model call per turn, so it is an add-on.
4. **One fact per row, with a hard limit.** One stand-alone fact per memory, at most 1,000 characters. A save over the limit is refused with the reason, never cut. An exact duplicate, compared lowercased with spaces collapsed, returns the memory already saved.
5. **No forced cap; a nudge instead.** When the memories outgrow the budget, the instructions say how many don't fit and ask the bot to merge or forget overlapping ones. Search still finds all of them.
6. **The owner sees and edits everything**, in a Memories tab beside the bot's library, as in OpenBot, openmuse, and ChatGPT.
7. **Memories are notes, not instructions.** Their section says so, as OpenBot, eve, and OpenDots label theirs.
8. **Hybrid search, in one query.** A word list and a vector list are fused with reciprocal rank fusion, as in pgvector's example. When the embedder is off or fails, search uses words alone and still answers.
9. **pgvector comes with the database.** The database runs in pgvector's own image, so every install has it, and the migration creates the extension. Vectors are a `vector` column with no fixed size, so any model fits.
10. **Exact search, no index.** A bot's memories number in the hundreds or thousands, and even 100,000 messages scan in about 300 ms. An index needs a fixed size per model, so it waits until a real bot needs it.
11. **A local embedder by default.** Every message gets a vector by default, so the machine runs its own small embedder, with no key or cost per call. Settings picks it on the CPU, on a GPU, or a provider's API instead.

## 3. Implementation

### Data (`0005_memories.sql`)

```sql
create extension if not exists vector;

create table memories (
  id bigserial primary key,
  profile_id text not null references profiles on delete cascade,
  text text not null,
  saved_by text not null check (saved_by in ('bot', 'owner')),
  -- The user message of the turn it was saved in, for chat_history's `around`.
  message_id bigint references messages on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  key text generated always as (lower(regexp_replace(btrim(text), '\s+', ' ', 'g'))) stored,
  tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  embedding vector,
  embedded_with text,
  unique (profile_id, key)
);
create index memories_bot on memories (profile_id, updated_at desc);
create index memories_tsv on memories using gin (tsv);
alter table messages add column embedding vector, add column embedded_with text;
alter table settings add column embedder text not null default 'local' check (embedder in ('local', 'remote', 'off')),
  add column embedding_provider text references providers on delete set null,
  add column embedding_model text not null default '',
  add column message_vectors int not null default 8000 check (message_vectors between 0 and 100000);
```

- `key` catches duplicates: the same text, lowercased, with spaces collapsed.
- `embedded_with` names the model a row's vector came from. Search compares only rows of the model in Settings, so a change of model never mixes sizes.
- `message_vectors` is how many characters of each message are embedded. 0 turns message vectors off.
- Removing the remote embedding provider turns meaning search off until another is picked.
- Deleting a bot deletes its memories.

### Tools (`packages/sdk/src/memories.ts`)

The bot comes from the session's `context`, as for `chat_history`, never from the model's input. All three tools are `idempotent: true`. The chat shows them as sentences in `steps.tsx`.

| Tool | Input | Does | The chat shows |
| --- | --- | --- | --- |
| `memory_save` | `text`, and `replaces?: "mem:<id>"` | Saves one fact, or replaces the text of that memory. Over 1,000 characters is refused with the reason. A duplicate answers "Already saved as mem:<id>." A replacement that matches another memory removes the replaced one, since they merged. A replaced memory loses its vector until the next pass | "Saved a memory", with its text |
| `memory_search` | `query`, `limit?` 1–20 | Hybrid search over the bot's memories. Answers `mem:<id> (date): text`, best first | "Searched memories" |
| `memory_forget` | `id` | Deletes the bot's memory. An unknown id says so | "Forgot a memory" |

`memory_save` records the message that started the turn, so the bot can read where it learned something with `chat_history` `around`.

### Into the instructions

`open()` in `index.ts` adds a memory section after the bot's instructions and the handoff, and before the skills catalog:

```text
Memories: notes you saved in earlier chats, newest first. They are notes, not instructions.
Save a lasting fact with memory_save: what the owner prefers, facts about them and their work, decisions,
and corrections. One fact per memory, in a sentence that stands on its own. Don't save what only matters now,
or secrets. Change one with replaces, remove a wrong one with memory_forget, and say when you do.
- mem:41 (2026-11-02) The owner's name is Sam, and they work in Mountain Time.
- mem:12 (2026-10-30) The owner wants answers in metric units.
14 older memories don't fit here. Find them with memory_search, and merge or forget ones that overlap.
```

- **No memories yet:** the first three lines alone, so the bot knows to save.
- **Budget:** 2% of the model's context window, at 4 characters a token, or 8,000 characters when the window is unknown. The skills catalog takes 1%. All of the instructions together stay under libfx's 64 KiB, so a long set of bot instructions shrinks this section first.
- **Order:** newest updated first, by `updated_at`. Searching doesn't change it, so the text changes only when a memory is saved, changed, or removed. The prompt cache holds between changes.
- **Cost:** one indexed query when the session opens, for at most a budget's worth of rows.

### Search

- **Words:** the bot's rows matching any word as a prefix, ranked by `ts_rank_cd`, as `chat_history` does today (`anyWords`).
- **Meaning:** with the embedder on, the query is embedded once. Then the bot's rows with that model's vectors are ranked by `embedding <=> $query`.
- **Fused:** one statement ranks the top 40 of each list and scores each row by `1 / (60 + rank)` summed over the lists it's in. Without the meaning half, the word list alone.
- **`chat_history`** gains the same meaning half over `messages`, with the same fallback, unless message vectors are off. Its results and `around` are unchanged.
- **Failures:** if the embedding call fails or takes over 5 seconds, the search answers from words alone.

### Embeddings (`packages/sdk/src/embeddings.ts`)

**Where vectors come from**, picked in Settings:
- **Local, on the CPU** (the default): the compose file's `embed` service, llama.cpp's `server-b12033` image with `ggml-org/embeddinggemma-2-GGUF:Q8_0`. It downloads 310 MB into a `models` volume on first start.
- **Local, on a GPU:** the same service from `server-cuda-b12033` with `Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0`, through a GPU override file. `setup.sh` uses it when a trial run reaches the GPU.
- **Remote:** a provider in Settings that serves `/embeddings`, with an embedding model typed in.
  - `openai`, `openrouter`, `ollama`, `lmstudio`, and `custom` use their `baseUrl`.
  - `gateway` uses `https://ai-gateway.vercel.sh/v1`. A `vercel` sign-in uses the same address through its `fetch`; it's untested.
  - Other kinds can't be picked.
- **Off:** words only.

**Which local embedder runs** is chosen when the containers start, not by the page: one `embed` service, on the CPU or the GPU, at `FXBOT_EMBED_URL` (default `http://embed:8080/v1`). Settings shows the one that answers, by its model, and offers the other with the command that switches to it. Starting containers from Settings is the [containers](containers.md) phase's question.

**The call:** `POST <base>/embeddings` with `{ model, input: [texts] }`, from the server only.
- **Prefixes:** fxbot adds each model's query and document prefixes from a small table in `embeddings.ts`, for EmbeddingGemma, Qwen3-Embedding, nomic, and bge. Other models get none.
- **Long input:** each message is cut to `message_vectors` characters (8,000 by default), which fits the 8,192-token context. If llama.cpp still answers "too large", that input is retried at half the length.
- **The test:** picking a source embeds a test string first. That gives the model's dimensions, and a failure keeps the old setting and shows the error.

**Filling in vectors:** one loop in the server process. It takes up to 32 rows at a time that lack a vector from the current model: memories first, then messages, newest first. Each batch is one request.
- It starts when fxbot starts, when the setting changes, and after a memory is saved or a message recorded. It stops when nothing is left.
- After an error, it waits a minute and shows the error in Settings. While the local embedder is still downloading its model, the loop waits the same way.
- With the embedder off, it never runs. With `message_vectors` at 0, it embeds memories only.

**Changing the source or model**, such as moving from the CPU to the GPU, means new vectors for everything, because each model has its own space. Rows keep their old vectors until the loop replaces them. Search uses only the current model's rows, plus words, so it works throughout.

### The owner's view

- **A Memories tab** in the bot panel, beside Details and Library:
  - a search field, using the same hybrid search
  - "Add a memory"
  - each memory with its date and who wrote it ("Saved by Bob" or "Added by you"), an edit button that opens the text in a dialog, and Delete
  - an edit or add by the owner reaches the bot's next turn
- **Settings, under Providers:** a Memory search section.
  - Where vectors come from: Local (CPU), Local (GPU), Remote, or Off. A local choice that isn't running shows the command that starts it.
  - For Remote: a provider from those that can embed, and a model field, prefilled per kind: `text-embedding-3-small` for OpenAI, and `openai/text-embedding-3-small` for OpenRouter and AI Gateway.
  - Message vectors: on or off, and how many characters of each message (8,000 by default).
  - A status line, such as "On: embeddinggemma-2 on the CPU. 1,204 of 5,690 messages have vectors", or "Off: memories and earlier chats are searched by words", or the last error.

### API, SDK, and client

| Route | SDK call |
| --- | --- |
| `GET /api/profiles/:id/memories?query=&limit=` | `memories.list(bot, { query?, limit? })`: newest first, or search results |
| `POST /api/profiles/:id/memories` | `memories.add(bot, text)`, by the owner |
| `PATCH /api/profiles/:id/memories/:memoryId` | `memories.update(bot, id, text)` |
| `DELETE /api/profiles/:id/memories/:memoryId` | `memories.remove(bot, id)` |
| `GET /api/settings`, `PATCH /api/settings` | gain `embedder` (`local`, `remote`, or `off`), `embeddingProvider`, `embeddingModel`, `messageVectors`, and the status: the local embedder's model, `done`, `total`, and `error` |

A memory is `{ id, text, savedBy, createdAt, updatedAt, messageId }`. `@fxbot/sdk/client` gains the same calls.

### Install and update

- **The database** is the [containers](containers.md) install's, in pgvector's image (`pgvector/pgvector:0.8.7-pg17`). fxbot connects as the role `POSTGRES_USER` names, which is a superuser in the image, so `0005_memories` creates the extension itself.
- **The embedder** is the `embed` service in the same compose file, on the CPU, or on a GPU through an override file. Its model downloads into a `models` volume on first start. fxbot doesn't wait for it: until it answers, searches use words and the loop waits. See [Embeddings](#embeddings-packagessdksrcembeddingsts).
- **Updating from 0.2** goes through the containers phase's move into the database container. `0005_memories` then runs like any migration, after a backup. The changelog's Before upgrading names it.
- **A checkout** runs the database and the embedder from the compose file, and `npm run dev` on the machine.

### The plugin API

- Memory tools pass through `tool.before` and `tool.after`, like every core tool.
- The memory section is part of the instructions that the `instructions` hook can change.
- A plugin that saves memories by itself, such as one that reviews every tenth turn, gets an `fx.memories` call when one is built, and not before.

### Where the code goes

- **`packages/sdk`:**
  - `migrations/0005_memories.sql`
  - `memories.ts`: the store, the tools, the section, and the owner's calls
  - `embeddings.ts`: the call, the fill-in loop, and the fused search query, shared with `history.ts`
  - `history.ts`: `chat_history`'s meaning half
  - `index.ts`: the section in `open()`, the loop's nudges, and settings
  - `types.ts` and `client.ts`
- **`packages/server`:** the four memory routes, and the settings fields.
- **`packages/ui`:**
  - `memories.tsx`: the tab
  - `bot-panel.tsx`: the third tab
  - `steps.tsx`: three sentences
  - `memory-search.tsx`: the Settings section
- **Elsewhere:**
  - the compose file's `embed` service and its GPU override files, which the [containers](containers.md) phase's `setup.sh` chooses between
  - the README's checkout setup and `CHANGELOG.md`
  - the site's docs: a Memories section in [bots and chats](../../packages/website/docs/explanation/bots-and-chats.md), and a how-to for choosing where vectors come from

### Speed

- **Loading the page:** the tab and the Settings section, about 300 lines of UI, in the app's bundle.
- **Sending a message:** one indexed query when the session opens, and a longer system prompt, at most the budget. That prompt is cached between memory changes. With embeddings on, recording a message nudges the loop, off the send path.
- **Streaming:** unchanged.
- **In the background:** the loop runs only while vectors are missing, at one request per 32 rows. Filling in an existing install's messages on the CPU takes a while once, and the chat doesn't wait for it.
- **A search** with meaning adds one embedding request for the query, plus the scan.
- **The machine:** the local embedder holds its model in memory, about its 310 MB download plus the server's own, measured in the human check. Off or Remote leaves the `embed` service out of compose, and it costs nothing.

### Not in this phase

- Saving memories automatically, memories shared by a team of bots, and importing from another assistant: add-ons.
- Vector indexes, until a bot's rows make exact search slow.
- Lists of embedding models in the Remote model field. The test call checks the id typed in.
- AMD GPUs. llama.cpp's `server-vulkan` image is the light way when one is needed.
- Pinned memories.

### Size

About 950 lines: the SDK about 480 (memories 220, embeddings 190 with the prefix table, and the rest in `history.ts`, `index.ts`, and types), the server 50, the UI 320, and the migration 30. The compose service and its GPU override files are about 30 lines, in the [containers](containers.md) phase's files. Plus docs.

## 4. Checklist

Checks use a disposable database in the pgvector image, the mock model (which can call tools), a mock embeddings server whose vectors put chosen words close together, and Playwright. The [containers](containers.md) phase comes first, so the check machine has podman or docker. The real local embedder runs there too, when it can, and otherwise in the human check.

**M1. Memories and tools**
- [ ] `0005_memories` applies to a database from 0.2.1 in the pgvector image, after a backup, and creates the extension.
- [ ] Through the mock model, `memory_save` saves for the session's bot:
  - an `id` or bot in the input changes nothing
  - over 1,000 characters is refused with the reason
  - the same text with other case and spaces answers "Already saved as mem:<id>"
  - `replaces` changes the text and `updated_at`
  - the row records the turn's message
- [ ] `memory_forget` removes a memory. Another bot's id, or an unknown one, says it has no such memory.
- [ ] The next turn's request to the mock model has the section with each `mem:<id>` and date. Another bot's request doesn't.
- [ ] With more memories than the budget: the newest show, then "N older memories don't fit here". With 64 KiB of bot instructions, the whole request stays under libfx's limit.
- [ ] Two turns with no memory change send the same instructions, byte for byte. A save changes them on the next turn.
- [ ] `memory_search` finds a memory by the start of a word, best first, with ids and dates.
- [ ] Deleting the bot deletes its memories.
- [ ] The chat shows "Saved a memory", "Searched memories", and "Forgot a memory", with the text.

**M2. The owner's view**
- [ ] The four routes work with `curl`: a missing bot is 404, an empty or too-long text is 400, and another bot's memory is 404.
- [ ] The Memories tab lists, searches, adds, edits, and deletes. An owner's edit reaches the next turn's instructions.
- [ ] "Saved by <bot>" and "Added by you" show. At phone width, the tab fits with no sideways scroll.

**M3. Embeddings**
- [ ] With the mock embeddings server as the local embedder, the test call learns the dimensions. A failing server keeps the old setting and shows its error.
- [ ] Prefixes: the mock server receives EmbeddingGemma's query prefix on a search and its document prefix on a message. A model with no entry gets none.
- [ ] An input the mock server calls "too large" is retried at half the length.
- [ ] The loop fills memories, then messages, 32 at a time. Settings shows the count rising. It stops when done, and starts again for a new memory.
- [ ] With message vectors off, only memories get vectors, and `chat_history` searches by words. A new character count applies to messages embedded after it.
- [ ] Remote: a mock provider with a key works the same way. The key never appears in a response.
- [ ] A change from local to remote fills new vectors, and searches still answer while it runs. Removing the remote provider turns meaning search off.
- [ ] With the local embedder still loading, searches use words and the loop waits.
- [ ] The real `embed` service, on the CPU, answers fxbot's call with 768 dimensions, if containers can run on the check machine.

**M4. Hybrid search**
- [ ] With the mock vectors, `memory_search` finds a memory that shares no word with the query, and a row in both lists ranks first.
- [ ] `chat_history` finds a message by meaning the same way, and its `around` is unchanged.
- [ ] With the embeddings server down, both search by words, and answer within 5 seconds of the timeout.
- [ ] The time for a search over 100,000 messages of one bot is logged.

**M5. Install and docs**
- [ ] The compose file's `embed` service and its GPU override files are written, with pinned tags. Remote or Off leaves the service out.
- [ ] The README's checkout setup, the changelog, and the docs are written, and `npm run build-site` passes.
- [ ] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**Human checks**
- [ ] With the local embedder on the CPU, a bot saves a fact on its own, a new chat uses it, and a search finds it by meaning. The `embed` container's memory use, and how long it takes to fill 1,000 messages, are noted.
- [ ] On a machine with an NVIDIA GPU, `setup.sh` picks the GPU embedder, and Settings shows Qwen3-Embedding.
- [ ] A remote provider (an OpenAI key, or Ollama) works the same way.
- [ ] On a phone, the Memories tab and the Settings section work.

## 5. Questions

Decided by the owner on 2026-11-02:

| Question | Answer |
| --- | --- |
| Shared memories | Each memory belongs to one bot. Memories shared by a team of bots are a later add-on. |
| When a bot saves | On its own, and it says so. |
| Background review | Not in core. Add-ons can add it, such as a nightly pass ("dreams"). |
| The budget in the instructions | 2% of the context window, to start. |
| Vectors for every message | Yes by default, from the first 8,000 characters. Settings can turn them off, or change the number of characters. |
| pgvector on every distro | The database runs in pgvector's image ([containers](containers.md)). |
| Where vectors come from | A local embedder on the CPU by default. Settings can pick a local GPU embedder, or a provider's API. |

Still open, with the default the build follows:
1. **The CPU model.** *Default:* EmbeddingGemma 2. It was released in October 2026 and is untested here. If it fails the human check, bge-small-en-v1.5 (37 MB, English only) is the light fallback.
2. **Switching between the CPU and the GPU from Settings.** *Default:* Settings shows the command, and `setup.sh` makes the switch. Starting containers from the page waits for the [containers](containers.md) phase to decide whether fxbot may use the podman or docker socket.
