-- The MCP registry's entries, mirrored so that search stays on this machine, and each source's last sync. A failed
-- sync keeps the entries it had.
create table if not exists registry_entries (source text not null, name text not null, version text not null,
  entry jsonb not null, updated_at timestamptz not null default now(), primary key (source, name));
create table if not exists registry_syncs (source text primary key, synced_at timestamptz, started_at timestamptz,
  error text);
