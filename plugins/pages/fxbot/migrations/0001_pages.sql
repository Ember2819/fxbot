-- A page's id is its library item's. Its text is there too, so a page outlives this schema, at its newest version.
create table pages (id text primary key, bot text not null);
create table versions (page text not null references pages on delete cascade, n integer not null,
  message_id text, session text not null, title text not null, type text not null, text text not null,
  at timestamptz not null default now(), primary key (page, n));
