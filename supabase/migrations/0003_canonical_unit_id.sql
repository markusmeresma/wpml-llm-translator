-- Add canonical_unit_id to deduplicate identical translation units across files
ALTER TABLE units ADD COLUMN canonical_unit_id uuid REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX idx_units_canonical ON units(canonical_unit_id);

-- Backfill regular units (no parent, no template): group by (project_id, source_text)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, source_text
      ORDER BY (machine_text IS NOT NULL) DESC, id
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY project_id, source_text
      ORDER BY (machine_text IS NOT NULL) DESC, id
    ) AS canonical_id
  FROM units
  WHERE parent_unit_id IS NULL
    AND source_html_template IS NULL
)
UPDATE units
SET canonical_unit_id = ranked.canonical_id
FROM ranked
WHERE units.id = ranked.id
  AND ranked.rn > 1;

-- Backfill compound parents (source_html_template IS NOT NULL)
WITH ranked_parents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, source_text
      ORDER BY (machine_text IS NOT NULL) DESC, id
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY project_id, source_text
      ORDER BY (machine_text IS NOT NULL) DESC, id
    ) AS canonical_id
  FROM units
  WHERE parent_unit_id IS NULL
    AND source_html_template IS NOT NULL
)
UPDATE units
SET canonical_unit_id = ranked_parents.canonical_id
FROM ranked_parents
WHERE units.id = ranked_parents.id
  AND ranked_parents.rn > 1;

-- Backfill segments of aliased parents: point at canonical parent's corresponding segment
WITH alias_parents AS (
  SELECT id, canonical_unit_id
  FROM units
  WHERE canonical_unit_id IS NOT NULL
    AND source_html_template IS NOT NULL
),
canonical_segments AS (
  SELECT id, parent_unit_id, segment_index
  FROM units
  WHERE parent_unit_id IN (
    SELECT canonical_unit_id FROM alias_parents
  )
)
UPDATE units
SET canonical_unit_id = cs.id
FROM alias_parents ap
JOIN canonical_segments cs ON cs.parent_unit_id = ap.canonical_unit_id
WHERE units.parent_unit_id = ap.id
  AND units.segment_index = cs.segment_index;

-- Sync status from canonical to aliases
UPDATE units AS alias
SET status = canonical.status,
    updated_at = NOW()
FROM units AS canonical
WHERE alias.canonical_unit_id = canonical.id
  AND alias.status != canonical.status;
