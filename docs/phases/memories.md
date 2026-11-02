# Memories

Each bot profile keeps its own persistent memory, so later conversations can use what that profile has already learned.

Decided in [provider logins](../_completed/phases/provider-logins.md): memories live in Postgres, and search is hybrid, pgvector plus full-text fused with reciprocal rank fusion. The embedding model is picked in Settings, from any provider that serves `/embeddings`. `chat_history` gains the vector half here.

**Core.** Every bot needs to keep what it learns. Keep the core to storing, searching, and recalling a bot's memories. Other ways to organize what a bot knows, such as a [knowledge graph](knowledge-base.md), are add-ons.

Not planned yet.
