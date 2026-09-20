import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

class BroadcastTargetTagsMissingError extends Error {}

const dbMocks = {
  getBroadcasts: vi.fn(),
  getBroadcastById: vi.fn(),
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  deleteBroadcast: vi.fn(),
  getLineAccountById: vi.fn(),
  getBroadcastTargetTagIds: vi.fn(),
  resolveTagBroadcastRecipients: vi.fn(),
  BroadcastTargetTagsMissingError,
  jstNow: vi.fn(() => '2026-07-11T21:00:00+09:00'),
};
vi.mock('@line-crm/db', () => dbMocks);

const lineClientMocks = {
  getMessageEventInsight: vi.fn(),
  getUnitInsight: vi.fn(),
  pushMessage: vi.fn(),
};
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => lineClientMocks),
}));

const broadcastServiceMocks = {
  processBroadcastSend: vi.fn(),
  processQueuedBroadcasts: vi.fn(),
  getEffectiveBroadcastMessages: vi.fn(),
  autoTrackBroadcastMessages: vi.fn(),
  buildMessages: vi.fn(),
  createBroadcastMessageLogStatements: vi.fn(),
};
vi.mock('../services/broadcast.js', () => broadcastServiceMocks);
vi.mock('../services/dedup-broadcast.js', () => ({
  computeDedupBroadcastPreview: vi.fn(),
}));
vi.mock('../services/segment-send.js', () => ({
  processSegmentSend: vi.fn(),
}));

const { broadcasts } = await import('./broadcasts.js');

type TestEnv = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    WORKER_URL: string;
  };
};

function makeBroadcast(sentAt: string | null) {
  return {
    id: 'broadcast-1',
    title: 'Broadcast',
    message_type: 'text',
    message_content: 'hello',
    target_type: 'all',
    target_tag_id: null,
    target_tag_ids: null,
    status: 'sent',
    scheduled_at: null,
    sent_at: sentAt,
    total_count: 10,
    success_count: 10,
    created_at: '2026-07-01T00:00:00+09:00',
    account_ids: null,
    dedup_priority: null,
    failed_account_ids: null,
    dedup_progress: null,
    batch_lock_at: null,
  };
}

function makeDb(existingTagIds?: string[]) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first<T>() {
          calls.push({ sql, binds });
          if (/SELECT line_request_id, aggregation_unit/i.test(sql)) {
            return {
              line_request_id: 'line-request-1',
              aggregation_unit: null,
              line_account_id: null,
              target_type: 'all',
              account_ids: null,
              failed_account_ids: null,
            } as T;
          }
          if (/SELECT id FROM broadcast_insights/i.test(sql)) {
            return { id: 'insight-1' } as T;
          }
          return null as T;
        },
        async run() {
          calls.push({ sql, binds });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() {
          calls.push({ sql, binds });
          const ids = existingTagIds ?? binds.map(String);
          return {
            results: binds
              .map(String)
              .filter((id) => ids.includes(id))
              .map((id) => ({ id })) as T[],
          };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

function setupApp(db: D1Database) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, LINE_CHANNEL_ACCESS_TOKEN: 'default-token', WORKER_URL: 'https://worker.example' };
    await next();
  });
  app.route('/', broadcasts);
  return app;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-11T21:00:00+09:00'));
  for (const fn of Object.values(dbMocks)) {
    if (vi.isMockFunction(fn)) fn.mockReset();
  }
  dbMocks.jstNow.mockReturnValue('2026-07-11T21:00:00+09:00');
  dbMocks.getBroadcastTargetTagIds.mockImplementation((broadcast: { target_tag_ids?: string | null; target_tag_id?: string | null }) => {
    if (broadcast.target_tag_ids) return JSON.parse(broadcast.target_tag_ids);
    return broadcast.target_tag_id ? [broadcast.target_tag_id] : [];
  });
  lineClientMocks.getMessageEventInsight.mockReset();
  lineClientMocks.getUnitInsight.mockReset();
  lineClientMocks.pushMessage.mockReset();
  for (const fn of Object.values(broadcastServiceMocks)) fn.mockReset();
});

describe('standard tag broadcast targeting', () => {
  test('creates an OR-targeted broadcast with unique tag ids and null legacy id', async () => {
    const created = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: null,
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
    };
    dbMocks.createBroadcast.mockResolvedValue(created);
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Tag broadcast',
        messageType: 'text',
        messageContent: 'hello',
        targetType: 'tag',
        targetTagIds: ['tag-a', 'tag-b', 'tag-a'],
      }),
    });

    expect(res.status).toBe(201);
    expect(dbMocks.createBroadcast).toHaveBeenCalledWith(db, expect.objectContaining({
      targetTagId: null,
      targetTagIds: ['tag-a', 'tag-b'],
    }));
    expect(await res.json()).toMatchObject({
      success: true,
      data: { targetTagId: 'tag-a', targetTagIds: ['tag-a', 'tag-b'] },
    });
  });

  test('accepts the legacy targetTagId input and writes both columns', async () => {
    const created = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: 'tag-a',
      target_tag_ids: '["tag-a"]',
      status: 'draft',
    };
    dbMocks.createBroadcast.mockResolvedValue(created);
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Legacy tag broadcast',
        messageType: 'text',
        messageContent: 'hello',
        targetType: 'tag',
        targetTagId: 'tag-a',
      }),
    });

    expect(res.status).toBe(201);
    expect(dbMocks.createBroadcast).toHaveBeenCalledWith(db, expect.objectContaining({
      targetTagId: 'tag-a',
      targetTagIds: ['tag-a'],
    }));
  });

  test('rejects empty, missing, or more than 20 unique tags', async () => {
    const app = setupApp(makeDb().db);
    const base = {
      title: 'Tag broadcast',
      messageType: 'text',
      messageContent: 'hello',
      targetType: 'tag',
    };

    for (const targetTagIds of [[], [''], Array.from({ length: 21 }, (_, index) => `tag-${index}`)]) {
      const res = await app.request('/api/broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...base, targetTagIds }),
      });
      expect(res.status).toBe(400);
    }
    expect(dbMocks.createBroadcast).not.toHaveBeenCalled();
  });

  test('rejects a tag id that does not exist', async () => {
    const { db } = makeDb(['tag-a']);
    const res = await setupApp(db).request('/api/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Tag broadcast',
        messageType: 'text',
        messageContent: 'hello',
        targetType: 'tag',
        targetTagIds: ['tag-a', 'missing'],
      }),
    });

    expect(res.status).toBe(400);
    expect(dbMocks.createBroadcast).not.toHaveBeenCalled();
  });

  test('updates a draft and writes both the JSON list and legacy compatibility field', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: 'tag-a',
      target_tag_ids: '["tag-a"]',
      status: 'draft',
    };
    const updated = { ...existing, target_tag_id: null, target_tag_ids: '["tag-a","tag-b"]' };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.updateBroadcast.mockResolvedValue(updated);
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagIds: ['tag-a', 'tag-b'] }),
    });

    expect(res.status).toBe(200);
    expect(dbMocks.updateBroadcast).toHaveBeenCalledWith(db, 'broadcast-1', expect.objectContaining({
      target_tag_id: null,
      target_tag_ids: '["tag-a","tag-b"]',
    }));
  });

  test('keeps the saved tag collection when updating another draft field', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: null,
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.updateBroadcast.mockResolvedValue({ ...existing, title: 'Renamed' });
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed' }),
    });

    expect(res.status).toBe(200);
    const updates = dbMocks.updateBroadcast.mock.calls[0][2];
    expect(updates).not.toHaveProperty('target_tag_id');
    expect(updates).not.toHaveProperty('target_tag_ids');
    expect(await res.json()).toMatchObject({
      data: { targetTagIds: ['tag-a', 'tag-b'] },
    });
  });

  test('rejects a legacy targetTagId-only update on a broadcast that has 2+ saved tags', async () => {
    // serializeBroadcast は互換のため先頭のタグを targetTagId に載せて返す。
    // それをそのまま送り返すクライアントで、集合が静かに 1 件へ狭まらないこと（PR #52 指摘 2-2）。
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: null,
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagId: 'tag-a' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false });
    expect(dbMocks.updateBroadcast).not.toHaveBeenCalled();
  });

  test('still allows changing the tags of a multi-tag broadcast when targetTagIds is explicit', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: null,
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.updateBroadcast.mockResolvedValue({ ...existing, target_tag_id: 'tag-a', target_tag_ids: '["tag-a"]' });
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagIds: ['tag-a'] }),
    });

    expect(res.status).toBe(200);
  });

  test('still accepts a legacy targetTagId update on a single-tag broadcast', async () => {
    // 従来のクライアント（SDK・MCP）の単一タグ運用は壊さない。
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_id: 'tag-a',
      target_tag_ids: null,
      status: 'draft',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.updateBroadcast.mockResolvedValue({ ...existing, target_tag_id: 'tag-b', target_tag_ids: '["tag-b"]' });
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagId: 'tag-b' }),
    });

    expect(res.status).toBe(200);
  });

  test('keeps multi-account-dedup on its legacy single tag field', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'multi-account-dedup',
      target_tag_id: 'tag-a',
      target_tag_ids: null,
      status: 'draft',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.updateBroadcast.mockResolvedValue({ ...existing, target_tag_id: 'tag-b' });
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagId: 'tag-b' }),
    });

    expect(res.status).toBe(200);
    expect(dbMocks.updateBroadcast).toHaveBeenCalledWith(db, 'broadcast-1', expect.objectContaining({
      target_tag_id: 'tag-b',
      target_tag_ids: null,
    }));
  });

  test('uses the shared recipient resolver for preview counts', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
      line_account_id: 'account-1',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.resolveTagBroadcastRecipients.mockResolvedValue([
      { id: 'friend-a' },
      { id: 'friend-b' },
    ]);
    const { db } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1/preview-count');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { count: 2 } });
    expect(dbMocks.resolveTagBroadcastRecipients).toHaveBeenCalledWith(db, {
      tagIds: ['tag-a', 'tag-b'],
      lineAccountId: 'account-1',
    });
  });

  test('queues more than 500 OR recipients with the fail-safe tag marker', async () => {
    const existing = {
      ...makeBroadcast(null),
      target_type: 'tag',
      target_tag_ids: '["tag-a","tag-b"]',
      status: 'draft',
      line_account_id: 'account-1',
    };
    dbMocks.getBroadcastById.mockResolvedValue(existing);
    dbMocks.resolveTagBroadcastRecipients.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({ id: `friend-${index}` })),
    );
    const { db, calls } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1/send', {
      method: 'POST',
    });

    expect(res.status).toBe(202);
    expect(calls).toContainEqual(expect.objectContaining({
      binds: ['{"kind":"tag_or_queued"}', 'broadcast-1'],
    }));
  });
});

describe('broadcast test-send', () => {
  test('sends every saved message in one push request and logs each message', async () => {
    const broadcast = {
      ...makeBroadcast(null),
      status: 'draft',
      line_account_id: 'account-1',
    };
    dbMocks.getBroadcastById.mockResolvedValue(broadcast);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-1',
      channel_access_token: 'test-token',
      liff_id: 'liff-1',
    });

    const sourceMessages = [
      { position: 0, messageType: 'text', messageContent: 'first', altText: null },
      { position: 1, messageType: 'image', messageContent: '{}', altText: null },
    ];
    const builtMessages = [
      { type: 'text', text: '【テスト配信】\nfirst' },
      { type: 'image', originalContentUrl: 'https://example.test/a.jpg', previewImageUrl: 'https://example.test/a.jpg' },
    ];
    broadcastServiceMocks.getEffectiveBroadcastMessages.mockResolvedValue(sourceMessages);
    broadcastServiceMocks.autoTrackBroadcastMessages.mockImplementation(async (_db, messages) => messages);
    broadcastServiceMocks.buildMessages.mockReturnValue(builtMessages);

    const logStatements = [{ kind: 'log-0' }, { kind: 'log-1' }] as unknown as D1PreparedStatement[];
    broadcastServiceMocks.createBroadcastMessageLogStatements.mockReturnValue(logStatements);

    const batch = vi.fn(async () => []);
    const db = {
      prepare(sql: string) {
        const stmt = {
          bind: (..._args: unknown[]) => stmt,
          async first<T>() {
            if (sql.includes('account_settings')) return { value: '["friend-1"]' } as T;
            return null as T;
          },
          async all<T>() {
            if (sql.includes('FROM friends')) {
              return { results: [{ id: 'friend-1', line_user_id: 'U-test' }] as T[] };
            }
            return { results: [] as T[] };
          },
        };
        return stmt;
      },
      batch,
    } as unknown as D1Database;

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1/test-send', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(lineClientMocks.pushMessage).toHaveBeenCalledWith('U-test', builtMessages);
    expect(broadcastServiceMocks.getEffectiveBroadcastMessages).toHaveBeenCalledWith(db, broadcast);
    expect(broadcastServiceMocks.buildMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ messageContent: '【テスト配信】\nfirst' }),
      ]),
      'liff-1',
    );
    expect(batch).toHaveBeenCalledWith(logStatements);
    expect(await res.json()).toEqual({ success: true, sent: 1, failed: 0 });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/broadcasts/:id/fetch-insight', () => {
  test('returns 400 before 24 hours have elapsed and does not call LINE API', async () => {
    dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast('2026-07-10T22:30:00+09:00'));
    const { db, calls } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1/fetch-insight', {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      error: 'insight not ready: wait at least 24h after send',
    });
    expect(lineClientMocks.getMessageEventInsight).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  test('fetches and stores insight after 24 hours have elapsed', async () => {
    dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast('2026-07-10T20:30:00+09:00'));
    lineClientMocks.getMessageEventInsight.mockResolvedValue({
      overview: {
        delivered: 10,
        uniqueImpression: 8,
        uniqueClick: 2,
        uniqueMediaPlayed: 1,
      },
    });
    const { db, calls } = makeDb();

    const res = await setupApp(db).request('/api/broadcasts/broadcast-1/fetch-insight', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(lineClientMocks.getMessageEventInsight).toHaveBeenCalledWith('line-request-1');
    expect(calls.some((call) => /UPDATE broadcast_insights SET/i.test(call.sql))).toBe(true);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        delivered: 10,
        uniqueImpression: 8,
        uniqueClick: 2,
        uniqueMediaPlayed: 1,
        openRate: 0.8,
        clickRate: 0.2,
      },
    });
  });
});
