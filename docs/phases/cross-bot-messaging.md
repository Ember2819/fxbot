# Cross-bot messaging

Bots message each other with one verb, `send`. A reply is a send back to the original sender that references the original message id. Guards are a server-stamped hop count, replies that do not trigger further sends, an idempotency key on each send, no self-sends, a cap on sends per turn, and a per-pair rate limit.

**Add-on.** A plugin that gives bots a `send` tool and starts the other bot's turn through the [plugin API](plugins.md). The guards above live in the plugin, which stamps them itself and never takes them from the model.

Not planned yet.
