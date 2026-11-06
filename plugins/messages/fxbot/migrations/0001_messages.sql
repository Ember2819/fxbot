-- One thread of messages, begun by a turn no message started, whatever the bots.
create table conversations (
  id serial primary key,
  turn text not null unique,                   -- the messageId of the turn that began it
  stopped_at timestamptz,
  at timestamptz not null default now()
);

-- Each message. Its turn in the receiver's chat has the messageId messages-in-<id>.
create table messages (
  id serial primary key,
  conversation int not null references conversations on delete cascade,
  from_bot text not null,
  to_bot text not null,
  text text not null,
  reply text not null check (reply in ('yes', 'no', 'maybe')),
  answers int references messages on delete set null,   -- the message this replies to, stamped by the server
  key text not null unique,                    -- a hash of the turn, the receiver, and the words
  files jsonb not null default '[]',
  turn text,                                   -- the messageId of the turn it started or joined
  answered_at timestamptz,
  state text not null default 'waiting' check (state in ('waiting', 'working', 'done', 'failed', 'stopped')),
  error text not null default '',
  at timestamptz not null default now(),
  ended_at timestamptz
);
create index messages_conversation on messages (conversation);
create index messages_turn on messages (turn);
create index messages_pair on messages (least(from_bot, to_bot), greatest(from_bot, to_bot), at);

-- What each bot does, for the others.
create table roles (bot text primary key, about text not null);
