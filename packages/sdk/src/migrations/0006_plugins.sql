-- Plugins (docs/phases/plugins.md). A plugin is an add-on of kind 'plugin', its settings are sealed in addon_secrets,
-- and its own data lives in a schema of its own, plugin_<name>, which its own migrations make. A message a plugin sent
-- names it, so the chat can say where the message came from. A session a plugin made for a bot keeps the provider it
-- started on, since a session runs only on that provider's agent, and stays out of the bot's earlier chats.
alter table sent add column if not exists plugin text;
create table if not exists plugin_sessions (id text primary key, profile_id text not null references profiles on delete cascade,
  provider text not null, plugin text not null, created_at timestamptz not null default now());
