-- What a bot sends a page, what's waiting for the owner's approval, and what the page saved. They belong to the page, not
-- a version, so a rewrite or a restore keeps them. `granted` is the hash of the text the owner approved to hold data.
alter table pages add column data jsonb, add column data_at timestamptz, add column pending jsonb, add column granted text;
create table saved (page text not null references pages on delete cascade, key text not null, value jsonb not null,
  at timestamptz not null default now(), primary key (page, key));
