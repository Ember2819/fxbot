create table if not exists settings (id int primary key default 1 check (id = 1), default_provider text);
create table if not exists providers (id text primary key, kind text not null, name text not null, base_url text,
  model text not null default '', context_window int, team_id text, created_at timestamptz not null default now());
create table if not exists secrets (provider_id text primary key references providers on delete cascade,
  sealed bytea not null, updated_at timestamptz not null default now());
create table if not exists profiles (id text primary key, name text not null, instructions text not null default '',
  provider text references providers, model text not null default '', session_id text, handoff text, preview text,
  created_at timestamptz not null default now());
create table if not exists sent (profile_id text references profiles on delete cascade, message_id text,
  input text not null, files jsonb not null, primary key (profile_id, message_id));
create table if not exists messages (id bigserial primary key, profile_id text not null references profiles on delete cascade,
  session_id text not null, message_id text not null, role text not null, text text not null,
  created_at timestamptz not null default now(), tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  unique (profile_id, message_id, role));
create index if not exists messages_tsv on messages using gin (tsv);
create index if not exists messages_profile on messages (profile_id, created_at);
-- The library: one copy of each file by its SHA-256, and a tag for each bot and chat that saved it. A deleted bot's
-- tags keep the item, with no bot. Names split at ASCII separators, so "report" finds quarterly-report_v2.md.
create table if not exists library (id text primary key, sha256 text not null unique, kind text not null,
  origin text not null, name text not null, type text not null, size int not null, data bytea not null,
  text text not null default '', created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('simple',
    regexp_replace(name || ' ' || left(text, 200000), '[-_./\\]+', ' ', 'g'))) stored);
create table if not exists library_tags (item_id text not null references library on delete cascade,
  profile_id text references profiles on delete set null, session_id text,
  created_at timestamptz not null default now(), unique (item_id, profile_id, session_id));
create index if not exists library_tsv on library using gin (tsv);
create index if not exists library_tags_bot on library_tags (profile_id, created_at desc);
do $$ begin
  -- Images sent before the library move into it once, with the name and chat their message gave them. The same
  -- bytes held by several bots become one item, named by the earliest, with a tag for each.
  if exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'images') then
    create temp table moved on commit drop as
      select i.profile_id, split_part(i.name, '.', 1) as sha256, coalesce(f.name, i.name) as name, i.type, i.data,
        m.session_id, coalesce(m.created_at, now()) as created_at
      from images i
      left join lateral (select s.message_id, e->>'name' as name from sent s, jsonb_array_elements(s.files) e
        where s.profile_id = i.profile_id and e->>'url' = '/api/profiles/' || i.profile_id || '/uploads/' || i.name limit 1) f on true
      left join lateral (select session_id, created_at from messages
        where profile_id = i.profile_id and message_id = f.message_id and role = 'user') m on true;
    insert into library (id, sha256, kind, origin, name, type, size, data, created_at)
      select distinct on (sha256) left(replace(gen_random_uuid()::text, '-', ''), 12), sha256, 'image', 'uploaded', name, type,
        octet_length(data), data, created_at
      from moved order by sha256, created_at;
    insert into library_tags (item_id, profile_id, session_id, created_at)
      select l.id, mv.profile_id, mv.session_id, mv.created_at from moved mv join library l using (sha256) on conflict do nothing;
    drop table images;
  end if;
end $$;
create table if not exists models_dev (id int primary key default 1 check (id = 1), etag text, data jsonb, fetched_at timestamptz);
alter table profiles add column if not exists shape text not null default 'circle';
alter table profiles add column if not exists color text not null default 'brown';
do $$ begin
  -- The first bot starts pinned. Pins came after bots did, so adding the column pins the oldest bot, once.
  if not exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'profiles' and column_name = 'pinned_at') then
    alter table profiles add column pinned_at timestamptz;
    update profiles set pinned_at = now() where id = (select id from profiles order by created_at, id limit 1);
  end if;
end $$;
-- Add-ons, sealed values for them, and each bot's switch for an add-on chosen bot by bot. "allowed" names the tools
-- bots get; null means the read-only ones.
create table if not exists addons (id text primary key, kind text not null, name text not null, source jsonb not null,
  config jsonb not null, approved_hash text not null, enabled boolean not null default true,
  bots text not null default 'all', allowed jsonb, status text, created_at timestamptz not null default now());
create table if not exists addon_secrets (addon_id text primary key references addons on delete cascade,
  sealed bytea not null, updated_at timestamptz not null default now());
create table if not exists profile_addons (profile_id text references profiles on delete cascade,
  addon_id text references addons on delete cascade, enabled boolean not null, primary key (profile_id, addon_id));
do $$ begin
  -- A server once allowed all its tools or only the read-only ones. Now tools are allowed by name, once.
  if exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'addons' and column_name = 'trust') then
    alter table addons add column bots text not null default 'all', add column allowed jsonb;
    update addons set allowed = (select coalesce(jsonb_agg(t->'name'), '[]') from jsonb_array_elements(config->'tools') t) where trust = 'all';
    alter table addons drop column trust;
  end if;
end $$;
