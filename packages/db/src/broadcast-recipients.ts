import type { Broadcast } from './broadcasts.js';
import type { Friend } from './friends.js';

export class BroadcastTargetTagsMissingError extends Error {
  constructor() {
    super('No selected target tags still exist');
    this.name = 'BroadcastTargetTagsMissingError';
  }
}

export function getBroadcastTargetTagIds(
  broadcast: Pick<Broadcast, 'target_tag_ids' | 'target_tag_id'>,
): string[] {
  let parsed: unknown = null;
  if (broadcast.target_tag_ids) {
    try {
      parsed = JSON.parse(broadcast.target_tag_ids);
    } catch {
      parsed = null;
    }
  }

  const ids = Array.isArray(parsed)
    ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : broadcast.target_tag_id
      ? [broadcast.target_tag_id]
      : [];

  return [...new Set(ids)];
}

export interface ResolveTagBroadcastRecipientsInput {
  tagIds: string[];
  lineAccountId?: string | null;
}

/**
 * Resolve the OR-union of tag recipients with deterministic ordering.
 * EXISTS keeps each friend unique even when they have several selected tags.
 */
export async function resolveTagBroadcastRecipients(
  db: D1Database,
  input: ResolveTagBroadcastRecipientsInput,
): Promise<Friend[]> {
  const requestedTagIds = [...new Set(input.tagIds.filter((id) => id.length > 0))];
  if (requestedTagIds.length === 0) throw new BroadcastTargetTagsMissingError();

  const tagPlaceholders = requestedTagIds.map(() => '?').join(', ');
  const existingTagRows = await db
    .prepare(`SELECT id FROM tags WHERE id IN (${tagPlaceholders}) ORDER BY id ASC`)
    .bind(...requestedTagIds)
    .all<{ id: string }>();
  const existingTagIds = (existingTagRows.results ?? []).map((row) => row.id);
  if (existingTagIds.length === 0) throw new BroadcastTargetTagsMissingError();

  const existingPlaceholders = existingTagIds.map(() => '?').join(', ');
  let sql = `SELECT f.*
    FROM friends f
    WHERE f.is_following = 1`;
  const bindings: unknown[] = [];
  if (input.lineAccountId) {
    sql += ` AND f.line_account_id = ?`;
    bindings.push(input.lineAccountId);
  }
  sql += ` AND EXISTS (
      SELECT 1
      FROM friend_tags ft
      WHERE ft.friend_id = f.id
        AND ft.tag_id IN (${existingPlaceholders})
    )
    ORDER BY f.created_at DESC, f.id ASC`;
  bindings.push(...existingTagIds);

  const result = await db.prepare(sql).bind(...bindings).all<Friend>();
  return result.results ?? [];
}
