-- auto_reply が正常に返信できたとき、応答者へ任意のタグを付与できるようにする。
-- null のルールは従来どおりタグを付与しない。

ALTER TABLE auto_replies ADD COLUMN trigger_tag_id TEXT
  REFERENCES tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auto_replies_trigger_tag_id
  ON auto_replies(trigger_tag_id);
