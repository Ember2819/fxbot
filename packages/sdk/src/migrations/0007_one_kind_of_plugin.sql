-- One kind of plugin (docs/phases/one-kind-of-plugin.md). Add-ons are plugins now: their tables take the name, and a
-- plugin from a folder with plugin.json is of kind 'package'. Settings gain `unvetted`: false shows only the plugins
-- fxbot vets.
alter table addons rename to plugins;
alter table addon_secrets rename to plugin_secrets;
alter table plugin_secrets rename column addon_id to plugin_id;
alter table profile_addons rename to profile_plugins;
alter table profile_plugins rename column addon_id to plugin_id;
alter table skills rename column addon_id to plugin_id;
update plugins set kind = 'package' where kind = 'plugin';
alter table settings add column unvetted boolean not null default false;
