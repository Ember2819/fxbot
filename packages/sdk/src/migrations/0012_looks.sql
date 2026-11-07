-- A bot's look beyond its shape and color: what it feels and wears. Each default draws nothing new, so a bot from before
-- keeps its shape and color.
alter table profiles add column mood text not null default 'bright';
alter table profiles add column head text not null default 'none';
alter table profiles add column face text not null default 'none';
alter table profiles add column outfit text not null default 'none';
alter table profiles add column tint text not null default 'own';
