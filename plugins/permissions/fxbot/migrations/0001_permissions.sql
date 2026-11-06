-- Each bot's mode. A bot with no row has the `mode` setting's.
create table modes (bot text primary key, mode text not null check (mode in ('ask', 'auto', 'yolo')));

-- What Always allow saved. `input` is the exact action, or '' for the whole tool.
create table rules (
  id serial primary key,
  bot text not null,
  tool text not null,
  input text not null default '',
  at timestamptz not null default now(),
  unique (bot, tool, input)
);

-- The provider and model that review, for every bot. No row means each bot's own.
create table reviewer (id int primary key default 1 check (id = 1), provider text not null, model text not null);

-- Each card, kept 30 days.
create table asks (
  id serial primary key,
  call text not null unique,                   -- the turn and libfx's executionId, so a call that runs again finds its card
  bot text not null,
  session text not null,
  turn text not null,
  tool text not null,
  input jsonb not null,
  reason text not null default '',
  background boolean not null,
  state text not null default 'open' check (state in ('open', 'allowed', 'denied', 'expired', 'closed')),
  note text not null default '',
  expires_at timestamptz,
  at timestamptz not null default now(),
  ended_at timestamptz
);
create index asks_open on asks (bot) where state = 'open';
