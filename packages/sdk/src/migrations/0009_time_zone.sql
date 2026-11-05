-- The owner's time zone (docs/_completed/phases/routines.md): what plugins with a clock read through fx.timeZone(). Empty is the
-- machine's.
alter table settings add column time_zone text;
