-- Each room given a computer: the key that names the computer and its home, and whether the room uses it now.
create table computers (room int primary key, key text not null unique, enabled boolean not null default true);
