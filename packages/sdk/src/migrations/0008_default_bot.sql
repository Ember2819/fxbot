-- A default bot (docs/_completed/phases/default-bot.md): the bot whose chat a launch at / opens. Deleting the bot
-- clears it.
alter table settings add column default_profile text references profiles on delete set null;
