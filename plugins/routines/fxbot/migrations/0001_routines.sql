-- Each saved task. A finished one-time routine stays, with next_at null, until the tick prunes it.
create table routines (
  id serial primary key,
  bot text not null,
  name text not null,
  task text not null,
  cron text,                                    -- null: a one-time routine
  next_at timestamptz,                          -- the next firing, or null when it's finished
  paused boolean not null default false,
  failures int not null default 0,              -- in a row
  created_at timestamptz not null default now()
);
create unique index routines_name on routines (bot, lower(name));
create index routines_due on routines (next_at) where not paused and next_at is not null;

-- Each firing, the newest keepRuns a routine. Written before it runs, so a firing happens once.
create table runs (
  id serial primary key,
  routine int not null references routines on delete cascade,
  slot text not null,                           -- the local minute it was for, or now-<uuid> for Run now
  state text not null default 'running'
    check (state in ('running', 'done', 'quiet', 'failed', 'stopped', 'skipped', 'missed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reply text not null default '',               -- what it said, or why it failed
  files jsonb not null default '[]',            -- what it saved: each file's name and url
  untold boolean not null default false,        -- its result couldn't reach the bot's chat
  unique (routine, slot)
);
