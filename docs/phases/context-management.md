# Long-running chat and context management

Each bot keeps one conversation that never ends, so older turns must be summarized or dropped before they overflow the model's context window.

**Core.** Every long chat outgrows its model's context window. A plugin can change how a chat is summarized, through a hook in the [plugin API](../_completed/phases/plugins.md).

Not planned yet.
