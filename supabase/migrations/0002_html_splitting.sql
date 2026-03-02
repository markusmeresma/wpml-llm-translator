alter table units add column source_html_template text;
alter table units add column parent_unit_id uuid references units(id) on delete cascade;
alter table units add column segment_index integer;

create index idx_units_parent on units(parent_unit_id);
