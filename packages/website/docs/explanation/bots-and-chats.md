# Bots, chats, and the library

A bot in fxbot is meant to be talked to for months, not for one task. This page is about what that asks of a bot, its chat, and the files it keeps.

## A bot is a profile

A bot is a name, instructions, a provider and a model, and a look: one of fourteen shapes in one of eleven colors, drawn as a blob that blinks, hops while it works, and watches the pointer. Up to three bots can be pinned to the top of the list.

## One chat that lasts

Each bot has one long-running chat, a durable libfx session on the server. The page only shows it, so the chat survives a reload, a closed app, and a server restart, and a reply carries on while nobody watches.

Every message is also kept in Postgres, and each bot has a `chat_history` tool that searches its own messages, across all its chats, and reads them in full around a match. So a bot can look up what was said in an earlier chat, or long ago. It reaches only its own chats.

## Moving a bot to another provider

A session can't move between agents, and fxbot runs one agent per provider. So moving a bot starts a new chat. The old provider writes a summary of the old chat, or the new one when the old can't, and the new chat starts from it. The earlier messages show above the summary, and stay searchable with `chat_history`.

## The library

Chats hold files: images and text files you send, and documents bots save. The library keeps one copy of each, by the SHA-256 of its bytes, so the same file sent twice, or by two bots, is one item. Each item is tagged with every bot and chat that saved it, which leads it back to where it came from, and it outlives a deleted bot.

You see it two ways: across every bot, from the button beside Settings, and per bot, in the panel beside its chat. Bots reach it through three tools, `library_search`, `library_read`, and `library_save`, and only items tagged for them. A bot is tagged onto an item only by saving its exact bytes, so nothing passes from one bot to another through the library.

Deleting an item removes fxbot's copy for every bot. A chat that read a document keeps its text, and libfx keeps its own copy of an image until it ages out.

## Tools from MCP servers

An MCP server gives its tools to all bots, or to the bots you choose. libfx fixes an agent's tools when it is made, and one agent serves every bot on a provider. So each allowed tool goes to every agent, named after its server, and refuses to run inside a bot that wasn't chosen. Adding a server, or changing its tools, rebuilds the agents.

How to add one is in [Add an MCP server](/docs/how-to/add-an-mcp-server/).
