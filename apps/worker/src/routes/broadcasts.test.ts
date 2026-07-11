import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

const dbMocks = {
  getBroadcasts: vi.fn(),
  getBroadcastById: vi.fn(),
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  deleteBroadcast: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-07-11T21:00:00+09:00'),
};
vi.mock('@line-crm/db', () => dbMocks);

const lineClientMocks = {
  getMessageEventInsight: vi.fn(),
  getUnitInsight: vi.fn(),
};
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => lineClientMocks),
}));

vi.mock('../services/broadcast.js', () => ({
  processBroadcastSend: vi.fn(),
  buildMessage: vi.fn(),
  processQueuedBroadcasts: vi.fn(),
}));
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

function makeDb() {
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
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

function setupApp(db: D1Database) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, LINE_CHANNEL_ACCESS_TOKEN: 'default-token' };
    await next();
  });
  app.route('/', broadcasts);
  return app;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-11T21:00:00+09:00'));
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.jstNow.mockReturnValue('2026-07-11T21:00:00+09:00');
  lineClientMocks.getMessageEventInsight.mockReset();
  lineClientMocks.getUnitInsight.mockReset();
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
