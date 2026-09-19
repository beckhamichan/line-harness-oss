-- Standard tag broadcasts can target the union of multiple tags.
-- The legacy target_tag_id column remains for backwards compatibility.
ALTER TABLE broadcasts ADD COLUMN target_tag_ids TEXT
  CHECK (target_tag_ids IS NULL OR json_valid(target_tag_ids));
