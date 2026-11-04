-- This install's id. It labels the computers, homes, and images this fxbot makes, so another fxbot that shares the
-- engine, such as a checkout beside a release on one machine, leaves them be.
create table install (id text not null);
insert into install (id) values (replace(gen_random_uuid()::text, '-', ''));
