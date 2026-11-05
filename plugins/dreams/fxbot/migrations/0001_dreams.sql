-- The day: each turn of a bot the plugin is on for, kept until a finished dream reads it, and 7 days at most.
create table turns (
  id bigserial primary key,
  bot text not null,
  at timestamptz not null default now(),
  source text not null default '',            -- '' for the bot's own chat, or the plugin that sent the message
  message text not null,                      -- cut at 4,000 characters
  reply text not null,                        -- cut at 4,000 characters
  tools jsonb not null default '[]',          -- [{ tool, input, error? }], at most 20
  error text,
  night int                                   -- the dream that read it
);
create index turns_waiting on turns (bot, id) where night is null;

-- Each dream. A scheduled one is once a night per bot; Dream now runs any time.
create table nights (
  id serial primary key,
  bot text not null,
  night date not null,
  scheduled boolean not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state text not null default 'dreaming' check (state in ('dreaming', 'done', 'failed', 'stopped', 'off')),
  turns int not null default 0,               -- turns read
  left_out int not null default 0,            -- waiting turns that didn't fit
  summary text not null default ''            -- its last line, or what went wrong
);
create unique index nights_scheduled on nights (bot, night) where scheduled;

-- Each change a dream made, with what Undo puts back.
create table changes (
  id serial primary key,
  night int not null references nights on delete cascade,
  kind text not null check (kind in ('memory', 'skill')),
  target text not null,                       -- mem:<id>, or a skill's name
  before jsonb,                               -- null when it's new: { text }, or { description, instructions }
  after jsonb not null,
  merged_into text,                           -- the mem:<id> a changed memory merged into
  sources jsonb not null,                     -- [{ id, at, where, owner, bot }]
  undone_at timestamptz
);

-- The skills dreams wrote, by bot. fxbot has them through fx.skills.set, set again at each start.
create table skills (
  bot text not null,
  name text not null,
  description text not null,
  instructions text not null,
  updated_at timestamptz not null default now(),
  primary key (bot, name)
);
