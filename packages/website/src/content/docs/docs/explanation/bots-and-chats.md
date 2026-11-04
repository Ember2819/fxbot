---
title: "Bots, chats, memories, and the library"
description: "A bot in fxbot is meant to be talked to for months, not for one task. This page is about what that asks of a bot, its chat, what it remembers, and the files it keeps."
---

A bot in fxbot is meant to be talked to for months, not for one task. This page is about what that asks of a bot, its chat, what it remembers, and the files it keeps.

## A bot is a profile

A bot is a name, instructions, a provider and a model, and a look: one of fourteen shapes in one of eleven colors, drawn as a blob that blinks, hops while it works, and watches the pointer. Up to three bots can be pinned to the top of the list.

## One chat that lasts

Each bot has one long-running chat, a durable libfx session on the server. The page only shows it, so the chat survives a reload, a closed app, and a server restart, and a reply carries on while nobody watches.

Every message is also kept in Postgres, and each bot has a `chat_history` tool that searches its own messages, across all its chats, and reads them in full around a match. So a bot can look up what was said in an earlier chat, or long ago. It reaches only its own chats.

## The default bot

One bot can be the default, picked in **Settings** › **General**. Opening fxbot at its address then opens that bot's chat, where it left off, instead of the list of bots. A link to another screen opens that screen, and a reload stays where it was. Deleting the bot clears the choice.

## Memories

A bot keeps what it learns as memories: what you prefer, facts about you and your work, decisions, and corrections. Each memory is one fact, in a sentence that stands on its own, of at most 1,000 characters. Memories belong to one bot, not to a chat, so a new chat, or a move to another provider, keeps them. Deleting the bot deletes them.

The bot saves them on its own, during its turns, with three tools. The chat shows each as a sentence:

- `memory_save` saves a fact, as **Saved a memory**. Given `replaces` and a memory's `mem:<id>`, it changes that memory instead. Saving what is already saved, in other case or spacing, answers with the memory that's there. A change that says what another memory says merges the two.
- `memory_search` finds memories, as **Searched memories**.
- `memory_forget` removes one that is wrong or no longer true, as **Forgot a memory**.

A memory the bot saves records the message of the turn it was saved in. `memory_search` names that message, and `chat_history` reads it, with what came before and after.

The newest memories are in the bot's instructions, which fxbot sends on every turn: newest first, each with its `mem:<id>` and date. They take at most 2% of the model's context window, at 4 characters a token, or 8,000 characters when the window isn't known. All the instructions together stay within libfx's 64 KiB, so very long bot instructions leave less room for memories. When more memories don't fit, a line says how many, and asks the bot to merge or forget ones that overlap. `memory_search` finds the rest. The section calls them notes, not instructions.

The section changes only when a memory is saved, changed, or removed, not when one is searched, so the model's prompt cache holds between changes. And since the instructions go with every turn, a memory saved in a long chat reaches that chat on its next turn.

You see a bot's memories under **Memories** on its edit screen, which **Edit** in its panel opens: newest first, each with its date, and **Saved by** the bot or **Added by you**. Search them there, add one with **Add a memory**, change one with its pencil button, or delete one. The bot sees your change on its next turn.

## Search by words and by meaning

`memory_search` and `chat_history` find matches in two ways at once:

- **By words.** Any word of the search counts, also as the start of a longer word, and more matches rank higher.
- **By meaning.** An embedding model turns each memory and message into a vector: a list of numbers that puts texts of close meaning close together. The search's own vector finds the nearest. How close the nearest one is varies from search to search, so only matches within 0.05, in cosine distance, of the nearest count.

The two lists are fused with reciprocal rank fusion, so a match in both ranks above a match in one. When there is no embedder, or it doesn't answer within 5 seconds, search uses words alone, and still answers.

The vectors come from a local embedder on the machine, on its CPU by default or on a GPU, or from a provider's embedding model. How to choose: [Choose where memory search's vectors come from](/docs/how-to/memory-search/). One loop in the server fills in the vectors that are missing, memories first, then messages, newest first, and the chat never waits for it. Each model has vectors of its own, so a new model means new vectors for everything. Until they are done, search uses the vectors the current model has made, and words.

Vectors are kept in Postgres, with pgvector, beside the rows they belong to. A search compares the query with each of the bot's vectors, with no index, since an index takes vectors of one size and each model has its own. Over 100,000 messages of one bot, that took about a quarter of a second when measured.

## Moving a bot to another provider

A session can't move between agents, and fxbot runs one agent per provider. So moving a bot starts a new chat. The old provider writes a summary of the old chat, or the new one when the old can't, and the new chat starts from it. The earlier messages show above the summary, and stay searchable with `chat_history`.

## The library

Chats hold files: images and text files you send, and documents bots save. The library keeps one copy of each, by the SHA-256 of its bytes, so the same file sent twice, or by two bots, is one item. Each item is tagged with every bot and chat that saved it, which leads it back to where it came from, and it outlives a deleted bot.

You see it two ways: across every bot, from the button beside Settings, and per bot, in the panel beside its chat. Bots reach it through three tools, `library_search`, `library_read`, and `library_save`, and only items tagged for them. A bot is tagged onto an item only by saving its exact bytes, so nothing passes from one bot to another through the library.

Deleting an item removes fxbot's copy for every bot. A chat that read a document keeps its text, and libfx keeps its own copy of an image until it ages out.

## Tools from MCP servers

An MCP server gives its tools to all bots, or to the bots you choose. libfx fixes an agent's tools when it is made, and one agent serves every bot on a provider. So each allowed tool goes to every agent, named after its server, and refuses to run inside a bot that wasn't chosen. Adding a server, or changing its tools, rebuilds the agents.

How to add one is in [Add an MCP server](/docs/how-to/add-an-mcp-server/).
