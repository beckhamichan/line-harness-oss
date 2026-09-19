import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BroadcastTargetTagsMissingError,
  getBroadcastTargetTagIds,
  resolveTagBroadcastRecipients,
} from '../src/broadcast-recipients.js';

function asD1(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async all<T>() {
          return {
            results: sqlite.prepare(sql).all(...bindings) as T[],
            success: true,
            meta: {},
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('resolveTagBroadcastRecipients', () => {
  let sqlite: Database.Database;
  let db: D1Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE tags (id TEXT PRIMARY KEY);
      CREATE TABLE friends (
        id TEXT PRIMARY KEY,
        line_user_id TEXT NOT NULL,
        display_name TEXT,
        picture_url TEXT,
        status_message TEXT,
        is_following INTEGER NOT NULL,
        user_id TEXT,
        line_account_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        first_tracked_link_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE friend_tags (friend_id TEXT NOT NULL, tag_id TEXT NOT NULL);
      INSERT INTO tags (id) VALUES ('tag-a'), ('tag-b');
      INSERT INTO friends
        (id, line_user_id, is_following, line_account_id, created_at, updated_at)
      VALUES
        ('friend-a', 'Ua', 1, 'account-1', '2026-01-01', '2026-01-01'),
        ('friend-b', 'Ub', 1, 'account-1', '2026-01-02', '2026-01-02'),
        ('friend-c', 'Uc', 1, 'account-2', '2026-01-03', '2026-01-03'),
        ('friend-d', 'Ud', 0, 'account-1', '2026-01-04', '2026-01-04');
      INSERT INTO friend_tags (friend_id, tag_id) VALUES
        ('friend-a', 'tag-a'),
        ('friend-b', 'tag-a'),
        ('friend-b', 'tag-b'),
        ('friend-c', 'tag-b'),
        ('friend-d', 'tag-a');
    `);
    db = asD1(sqlite);
  });

  it('uses OR semantics and returns a friend only once across overlapping tags', async () => {
    const recipients = await resolveTagBroadcastRecipients(db, {
      tagIds: ['tag-a', 'tag-b'],
    });

    expect(recipients.map((friend) => friend.id)).toEqual([
      'friend-c',
      'friend-b',
      'friend-a',
    ]);
  });

  it('applies the selected LINE account boundary when present', async () => {
    const recipients = await resolveTagBroadcastRecipients(db, {
      tagIds: ['tag-a', 'tag-b'],
      lineAccountId: 'account-1',
    });

    expect(recipients.map((friend) => friend.id)).toEqual(['friend-b', 'friend-a']);
  });

  it('excludes friends whose line_account_id is NULL when an account is specified', async () => {
    // 本番の友だちは line_account_id が空のものが多い（2026-09-20 時点で 577 人中 577 人）。
    // アカウント指定ありの配信では、それらは対象外になる。アカウント未登録の運用では
    // 配信側も line_account_id が空なので絞り込みが発動せず全員が対象になるが、
    // アカウントを登録した途端に対象 0 人になりうる。その挙動をここで固定する
    // （ISSUE-0081: アカウント登録前に友だちのアカウント欄を埋める）。
    sqlite
      .prepare(
        `INSERT INTO friends (id, line_user_id, is_following, line_account_id, created_at, updated_at)
         VALUES ('friend-null', 'Un', 1, NULL, '2026-01-05', '2026-01-05')`,
      )
      .run();
    sqlite.prepare(`INSERT INTO friend_tags (friend_id, tag_id) VALUES ('friend-null', 'tag-a')`).run();

    const scoped = await resolveTagBroadcastRecipients(db, {
      tagIds: ['tag-a'],
      lineAccountId: 'account-1',
    });
    expect(scoped.map((friend) => friend.id)).not.toContain('friend-null');

    // アカウント未指定なら従来どおり含まれる
    const unscoped = await resolveTagBroadcastRecipients(db, { tagIds: ['tag-a'] });
    expect(unscoped.map((friend) => friend.id)).toContain('friend-null');
  });

  it('continues with remaining tags when only some saved tags were deleted', async () => {
    const recipients = await resolveTagBroadcastRecipients(db, {
      tagIds: ['deleted-tag', 'tag-b'],
    });

    expect(recipients.map((friend) => friend.id)).toEqual(['friend-c', 'friend-b']);
  });

  it('returns an empty list when an existing tag has no recipients', async () => {
    sqlite.prepare('INSERT INTO tags (id) VALUES (?)').run('tag-empty');

    await expect(resolveTagBroadcastRecipients(db, {
      tagIds: ['tag-empty'],
    })).resolves.toEqual([]);
  });

  it('stops delivery when all saved tags were deleted', async () => {
    await expect(resolveTagBroadcastRecipients(db, {
      tagIds: ['deleted-tag'],
    })).rejects.toBeInstanceOf(BroadcastTargetTagsMissingError);
  });
});

describe('getBroadcastTargetTagIds', () => {
  it('prefers the JSON list and removes duplicates', () => {
    expect(getBroadcastTargetTagIds({
      target_tag_ids: '["tag-a","tag-b","tag-a"]',
      target_tag_id: 'legacy',
    })).toEqual(['tag-a', 'tag-b']);
  });

  it('falls back to the legacy single tag', () => {
    expect(getBroadcastTargetTagIds({
      target_tag_ids: null,
      target_tag_id: 'legacy',
    })).toEqual(['legacy']);
  });
});
