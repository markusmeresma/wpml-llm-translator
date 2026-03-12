-- Add human_edited flag to track whether a reviewer changed the machine translation
ALTER TABLE units ADD COLUMN human_edited boolean NOT NULL DEFAULT false;

-- Backfill: mark units where review_text differs from machine_text
UPDATE units
SET human_edited = true
WHERE review_text IS NOT NULL
  AND machine_text IS NOT NULL
  AND review_text != machine_text;
