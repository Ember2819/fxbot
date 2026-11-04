-- What a room does with a message of the owner's that tags no bot, and how many bot replies one such message may lead
-- to. Rooms made before keep every bot answering, as they did; new ones start with the lead. Each bot reply keeps the
-- owner's message that began its chain, so the server counts them.
alter table rooms add column untagged text not null default 'everyone' check (untagged in ('lead', 'everyone'));
alter table rooms alter column untagged set default 'lead';
alter table rooms add column replies int not null default 10 check (replies between 1 and 30);
alter table messages add column chain int;
