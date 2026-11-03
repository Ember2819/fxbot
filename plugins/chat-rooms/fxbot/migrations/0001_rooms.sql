-- Rooms, the bots in each in the order they answer, what was said, and each bot's session for each room. A session
-- keeps the stream's cursor, to read the next reply from, and the last message the bot was shown.
create table rooms (id serial primary key, name text not null, created_at timestamptz not null default now());
create table members (room int not null references rooms on delete cascade, bot text not null, position int not null, primary key (room, bot));
create table messages (id serial primary key, room int not null references rooms on delete cascade, author text not null, text text not null,
  at timestamptz not null default now());
create table sessions (room int not null references rooms on delete cascade, bot text not null, session text not null,
  cursor int not null default 0, seen int not null default 0, primary key (room, bot));
