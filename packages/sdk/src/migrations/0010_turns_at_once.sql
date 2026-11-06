-- How many turns run at once, across every bot and chat. A turn waiting in a tool holds its place, so at the 4 it was,
-- four long commands stopped every other bot (docs/phases/permissions.md). The queue reads it when fxbot starts.
alter table settings add column turns_at_once int not null default 32;
