create extension if not exists "uuid-ossp";

create type unit_status as enum ('todo', 'in_review', 'verified');

create table projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  source_lang text not null,
  target_lang text not null,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_key text not null,
  original_attr text not null,
  external_href text,
  created_at timestamptz not null default now(),
  unique (project_id, file_key)
);

create table units (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  unit_key text not null,
  resname text,
  restype text,
  source_text text not null,
  machine_text text,
  review_text text,
  status unit_status not null default 'todo',
  updated_at timestamptz not null default now(),
  unique (project_id, file_id, unit_key)
);

create index idx_units_project_status on units(project_id, status);
create index idx_units_file_id on units(file_id);
