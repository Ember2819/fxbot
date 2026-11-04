---
title: "Core and plugins"
description: "fxbot is a small core that every install runs, and plugins that you add only if you want them. This page is about where that line falls, and why."
---

fxbot is a small core that every install runs, and plugins that you add only if you want them. This page is about where that line falls, and why.

## The core

The core is what every bot needs, and what fxbot needs to run:
- bots, each with its instructions and one long-running chat
- providers: accounts, keys, and local model servers
- the library, one copy of every file the chats hold
- each bot's memories, and its history, which the bot can search by words and by meaning
- the app, which installs on phones and desktops
- releases, updates, and the database's migrations
- keys and tokens, sealed in Postgres

It also holds the seams that plugins plug into: **Plugins** itself, which finds, adds, and updates them, and the plugin API, through which a plugin's code changes fxbot.

## Plugins

Everything else is a plugin. A plugin carries any mix of three things, and at least one of them:
- [skills](/docs/how-to/add-a-skill/), with instructions that a bot reads when a task needs them
- [MCP servers](/docs/how-to/add-an-mcp-server/), which give bots tools from a remote service
- [code](/docs/how-to/add-a-plugin/), which runs inside fxbot and can add screens, tools, its own tables and settings, and the turns it starts

Each goes to all bots, or only to the ones you choose; its screens are for everyone. By default, fxbot shows only the plugins it vets, tagged **fxbot**, and a switch in Settings › Plugins shows the public registries too. What each part may do is in the [Security model](/docs/explanation/security/#vetted-plugins).

The plugin API is the seam that most later features plug into. fxbot's own plugins, such as chat rooms, use it as anyone's do.

## Why the line is there

Every install runs the core, so everything in it costs every owner: code to keep safe, work on each request, and weight in the page. A plugin costs only the owners who add it. So a feature goes in the core only when every bot needs it, when plugins need it to plug in, or when fxbot needs it to run.

A plugin that you haven't added costs nothing: no process, no timer, no requests, and no space in the app outside **Plugins**. Removing one leaves the rest of fxbot as it was.

When a feature can't be built as a plugin, what's missing is a seam. The core gets the smallest seam that the plugin needs, and the feature stays a plugin. fxbot's own plugins use the same seams as anyone's.
