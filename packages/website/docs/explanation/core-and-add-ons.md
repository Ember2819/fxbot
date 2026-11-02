# Core and add-ons

fxbot is a small core that every install runs, and add-ons that you add only if you want them. This page is about where that line falls, and why.

## The core

The core is what every bot needs, and what fxbot needs to run:
- bots, each with its instructions and one long-running chat
- providers: accounts, keys, and local model servers
- the library, one copy of every file the chats hold
- each bot's memories, and its history, which the bot can search by words and by meaning
- the app, which installs on phones and desktops
- releases, updates, and the database's migrations
- keys and tokens, sealed in Postgres

It also holds the seams that add-ons plug into: **Add-ons** itself, which finds, adds, and updates them, and the kinds of add-on that fxbot can run.

## Add-ons

Everything else is an add-on. Today an add-on is one of these:
- an [MCP server](/docs/how-to/add-an-mcp-server/), which gives bots tools from a remote service
- a [skill](/docs/how-to/add-a-skill/), with instructions that a bot reads when a task needs them

Each goes to all bots, or only to the ones you choose. fxbot's own lists suggest a few, tagged **fxbot**, and search finds more. What each kind may do is in the [Security model](/docs/explanation/security/#mcp-servers).

## Why the line is there

Every install runs the core, so everything in it costs every owner: code to keep safe, work on each request, and weight in the page. An add-on costs only the owners who add it. So a feature goes in the core only when every bot needs it, when add-ons need it to plug in, or when fxbot needs it to run.

An add-on that you haven't added costs nothing: no process, no timer, no requests, and no space in the app outside **Add-ons**. Removing one leaves the rest of fxbot as it was.

When a feature can't be built as an add-on, what's missing is a seam. The core gets the smallest seam that the add-on needs, and the feature stays an add-on. fxbot's own add-ons use the same seams as anyone's.
