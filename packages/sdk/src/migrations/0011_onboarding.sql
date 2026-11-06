-- First run. `onboarding_step` is where a new owner is, and `onboarded_at` says they finished or skipped it. Anyone already
-- using fxbot is done.
alter table settings add column onboarding_step text;
alter table settings add column onboarded_at timestamptz;
insert into settings (id) values (1) on conflict (id) do nothing;
update settings set onboarded_at = now() where exists (select 1 from profiles) or exists (select 1 from plugins) or exists (select 1 from providers);
