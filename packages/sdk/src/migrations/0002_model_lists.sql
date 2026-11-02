-- Each provider's model list as last fetched, so a restart still has it and a fresh one is fetched behind it.
create table if not exists model_lists (provider_id text primary key references providers on delete cascade,
  models jsonb not null, fetched_at timestamptz not null default now());
