-- A broadcast can contain 1-5 ordered messages.
-- Legacy broadcasts keep message_type/message_content/alt_text on the parent row;
-- these columns remain the compatibility mirror for the first message.
CREATE TABLE broadcast_messages (
  id              TEXT PRIMARY KEY,
  broadcast_id    TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  message_type    TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex')),
  message_content TEXT NOT NULL,
  alt_text        TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE (broadcast_id, position)
);

-- Preserve every existing one-message broadcast as position 0. The deterministic
-- id keeps the backfill auditable and cannot collide across broadcasts.
INSERT INTO broadcast_messages (
  id, broadcast_id, position, message_type, message_content, alt_text, created_at
)
SELECT
  id || ':0', id, 0, message_type, message_content, alt_text, created_at
FROM broadcasts;

-- Existing broadcast logs represent the sole message and therefore become index 0.
-- Non-broadcast logs remain NULL because message_index has no meaning for them.
ALTER TABLE messages_log ADD COLUMN message_index INTEGER
  CHECK (message_index IS NULL OR message_index BETWEEN 0 AND 4);

UPDATE messages_log
SET message_index = 0
WHERE broadcast_id IS NOT NULL;
