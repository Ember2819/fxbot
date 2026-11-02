-- Memories, and vectors for meaning search, from pgvector. fxbot's database image has it, and fxbot's role there is a
-- superuser that can add it. A 0.2 install on the machine's own Postgres has neither: it moves into containers with
-- setup.sh, and this says so instead of failing on a missing type.
do $$ begin
  if not exists (select from pg_extension where extname = 'vector') then
    if not exists (select from pg_available_extensions where name = 'vector') then
      raise exception 'fxbot''s memories need pgvector, which this Postgres lacks. Since 0.3, fxbot runs as containers with pgvector built in: run setup.sh again to move this install into them.';
    end if;
    if not (select rolsuper from pg_roles where rolname = current_user) then
      raise exception 'fxbot''s memories need the pgvector extension, which only a superuser can add to this database: sudo -u postgres psql -d % -c ''create extension vector''', current_database();
    end if;
    create extension vector;
  end if;
end $$;

-- One fact per row. `key` catches a duplicate: the same text, lowercased, with its spaces collapsed.
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

-- A vector of no fixed size, so any model fits. Search compares only rows of the model in use (`embedded_with`).
alter table messages add column embedding vector, add column embedded_with text;

-- Where vectors come from: the machine's local embedder, a provider's /embeddings, or none. `message_vectors` is how
-- many characters of each message are embedded, and 0 embeds none.
alter table settings add column embedder text not null default 'local' check (embedder in ('local', 'remote', 'off')),
  add column embedding_provider text references providers on delete set null,
  add column embedding_model text not null default '',
  add column message_vectors int not null default 8000 check (message_vectors between 0 and 100000);
