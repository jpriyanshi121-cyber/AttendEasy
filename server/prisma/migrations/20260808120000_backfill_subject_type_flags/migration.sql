-- The 20260803120000_add_subject_type_flags migration added hasLecture /
-- hasTutorial / hasPractical with static defaults (true / false / false) —
-- it never looked at each subject's existing Slot rows. Any subject created
-- before that migration ran (e.g. one that already had "practical" or
-- "tutorial" slots) was left with hasPractical/hasTutorial stuck at false,
-- even though it genuinely has slots of that type. This backfills those
-- flags from the Slot data that already exists, so PDF export / Subject
-- Detail's per-type breakdown picks up components that were silently
-- missing.

UPDATE "Subject" s
SET "hasPractical" = true
WHERE s."hasPractical" = false
  AND EXISTS (
    SELECT 1 FROM "Slot" sl WHERE sl."subjectId" = s."id" AND sl."type" = 'practical'
  );

UPDATE "Subject" s
SET "hasTutorial" = true
WHERE s."hasTutorial" = false
  AND EXISTS (
    SELECT 1 FROM "Slot" sl WHERE sl."subjectId" = s."id" AND sl."type" = 'tutorial'
  );

UPDATE "Subject" s
SET "hasLecture" = true
WHERE s."hasLecture" = false
  AND EXISTS (
    SELECT 1 FROM "Slot" sl WHERE sl."subjectId" = s."id" AND sl."type" = 'lecture'
  );