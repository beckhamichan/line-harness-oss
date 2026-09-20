import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBroadcastMessages,
  replaceBroadcastMessages,
  type BroadcastMessageInput,
} from '../src/broadcasts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, '..', 'migrations', '048_broadcast_messages.sql');

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
          return { results: sqlite.prepare(sql).all(...bindings) as T[] };
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...bindings) as T | undefined) ?? null;
        },
        async run() {
          const info = sqlite.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: info.changes }, results: [] };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
}

function createMessageTables(sqlite: Database.Database): void {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE broadcasts (
      id TEXT PRIMARY KEY,
      message_type TEXT NOT NULL,
      message_content TEXT NOT NULL,
      alt_text TEXT
    );

    CREATE TABLE broadcast_messages (
      id TEXT PRIMARY KEY,
      broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
      message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex')),
      message_content TEXT NOT NULL,
      alt_text TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (broadcast_id, position)
    );
  `);
}

describe('broadcast message migration', () => {
  it('backfills existing broadcasts and marks existing broadcast logs as message 0', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE broadcasts (
        id TEXT PRIMARY KEY,
        message_type TEXT NOT NULL,
        message_content TEXT NOT NULL,
        alt_text TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE messages_log (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT
      );

      INSERT INTO broadcasts VALUES
        ('broadcast-a', 'text', 'first', NULL, '2026-09-20T10:00:00+09:00'),
        ('broadcast-b', 'flex', '{"type":"bubble"}', 'preview', '2026-09-20T11:00:00+09:00');

      INSERT INTO messages_log VALUES
        ('log-broadcast', 'broadcast-a'),
        ('log-manual', NULL);
    `);

    sqlite.exec(readFileSync(MIGRATION_PATH, 'utf8'));

    const messages = sqlite
      .prepare(`
        SELECT id, broadcast_id, position, message_type, message_content, alt_text, created_at
        FROM broadcast_messages
        ORDER BY broadcast_id
      `)
      .all();

    expect(messages).toEqual([
      {
        id: 'broadcast-a:0',
        broadcast_id: 'broadcast-a',
        position: 0,
        message_type: 'text',
        message_content: 'first',
        alt_text: null,
        created_at: '2026-09-20T10:00:00+09:00',
      },
      {
        id: 'broadcast-b:0',
        broadcast_id: 'broadcast-b',
        position: 0,
        message_type: 'flex',
        message_content: '{"type":"bubble"}',
        alt_text: 'preview',
        created_at: '2026-09-20T11:00:00+09:00',
      },
    ]);

    expect(
      sqlite.prepare('SELECT id, message_index FROM messages_log ORDER BY id').all(),
    ).toEqual([
      { id: 'log-broadcast', message_index: 0 },
      { id: 'log-manual', message_index: null },
    ]);

    expect(() =>
      sqlite
        .prepare(`
          INSERT INTO broadcast_messages
            (id, broadcast_id, position, message_type, message_content, created_at)
          VALUES ('too-many', 'broadcast-a', 5, 'text', 'sixth', '2026-09-20')
        `)
        .run(),
    ).toThrow();

    expect(() =>
      sqlite.prepare(`UPDATE messages_log SET message_index = 5 WHERE id = 'log-broadcast'`).run(),
    ).toThrow();

    sqlite.prepare(`DELETE FROM broadcasts WHERE id = 'broadcast-a'`).run();
    expect(
      sqlite.prepare(`SELECT COUNT(*) AS count FROM broadcast_messages WHERE broadcast_id = 'broadcast-a'`).get(),
    ).toEqual({ count: 0 });

    sqlite.close();
  });
});

describe('broadcast message helpers', () => {
  let sqlite: Database.Database;
  let db: D1Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    createMessageTables(sqlite);
    sqlite
      .prepare(`
        INSERT INTO broadcasts (id, message_type, message_content, alt_text)
        VALUES ('broadcast-1', 'text', 'legacy', NULL)
      `)
      .run();
    db = asD1(sqlite);
  });

  it('stores one message and mirrors it to the legacy columns', async () => {
    const saved = await replaceBroadcastMessages(db, 'broadcast-1', [
      { messageType: 'text', messageContent: 'updated' },
    ]);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      broadcast_id: 'broadcast-1',
      position: 0,
      message_type: 'text',
      message_content: 'updated',
      alt_text: null,
    });
    expect(
      sqlite
        .prepare(`
          SELECT message_type, message_content, alt_text
          FROM broadcasts
          WHERE id = 'broadcast-1'
        `)
        .get(),
    ).toEqual({
      message_type: 'text',
      message_content: 'updated',
      alt_text: null,
    });
  });

  it('stores five mixed messages in order and replaces the previous set', async () => {
    const messages: BroadcastMessageInput[] = [
      { messageType: 'text', messageContent: 'one' },
      {
        messageType: 'image',
        messageContent: '{"originalContentUrl":"https://example.test/a.jpg"}',
      },
      {
        messageType: 'flex',
        messageContent: '{"type":"bubble"}',
        altText: 'third preview',
      },
      { messageType: 'text', messageContent: 'four' },
      { messageType: 'text', messageContent: 'five' },
    ];

    await replaceBroadcastMessages(db, 'broadcast-1', [
      { messageType: 'text', messageContent: 'old' },
    ]);
    const saved = await replaceBroadcastMessages(db, 'broadcast-1', messages);

    expect(saved.map((message) => ({
      position: message.position,
      type: message.message_type,
      content: message.message_content,
      altText: message.alt_text,
    }))).toEqual([
      { position: 0, type: 'text', content: 'one', altText: null },
      {
        position: 1,
        type: 'image',
        content: '{"originalContentUrl":"https://example.test/a.jpg"}',
        altText: null,
      },
      {
        position: 2,
        type: 'flex',
        content: '{"type":"bubble"}',
        altText: 'third preview',
      },
      { position: 3, type: 'text', content: 'four', altText: null },
      { position: 4, type: 'text', content: 'five', altText: null },
    ]);
    expect(await getBroadcastMessages(db, 'broadcast-1')).toEqual(saved);
    expect(
      sqlite.prepare(`SELECT message_type, message_content FROM broadcasts WHERE id = 'broadcast-1'`).get(),
    ).toEqual({ message_type: 'text', message_content: 'one' });
  });

  it('rejects zero messages without changing the saved set', async () => {
    await replaceBroadcastMessages(db, 'broadcast-1', [
      { messageType: 'text', messageContent: 'keep' },
    ]);

    await expect(replaceBroadcastMessages(db, 'broadcast-1', [])).rejects.toThrow(
      'broadcast messages must contain 1-5 items',
    );
    expect((await getBroadcastMessages(db, 'broadcast-1')).map((m) => m.message_content)).toEqual([
      'keep',
    ]);
  });

  it('rejects six messages without changing the saved set', async () => {
    await replaceBroadcastMessages(db, 'broadcast-1', [
      { messageType: 'text', messageContent: 'keep' },
    ]);
    const six = Array.from({ length: 6 }, (_, index) => ({
      messageType: 'text' as const,
      messageContent: `message-${index + 1}`,
    }));

    await expect(replaceBroadcastMessages(db, 'broadcast-1', six)).rejects.toThrow(
      'broadcast messages must contain 1-5 items',
    );
    expect((await getBroadcastMessages(db, 'broadcast-1')).map((m) => m.message_content)).toEqual([
      'keep',
    ]);
  });
});
