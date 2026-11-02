-- Skills, kept as libfx's SkillRecord: the body of SKILL.md as instructions, and the folder's other text files as
-- resources. Each belongs to an add-on of kind 'skill'. `manual` is a skill only a person calls by name.
create table if not exists skills (addon_id text not null references addons on delete cascade, name text not null,
  description text not null, instructions text not null, resources jsonb not null, manual boolean not null default false,
  primary key (addon_id, name));
