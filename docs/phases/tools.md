# Bot tools

Bots call host tools during a turn. Every libfx tool says whether it is safe to run twice, and the host authorizes each call; see [permissions](permissions.md).

**Core, for core data only.** The core's own tools reach only its own data: `chat_history`, the library's tools, and `skill` today, and later memories. Other tools, such as a shell, a browser, or files on this machine, are add-ons: MCP servers or [plugins](plugins.md). What every tool needs from the core is [permissions](permissions.md).

Not planned yet.
