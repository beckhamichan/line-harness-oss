import { describe, expect, test, beforeEach, vi } from 'vitest';

// --- module mocks (must be defined before importing the route) ---
const dbMocks = {
  getFriendByLineUserId: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-06-21T12:00:00+09:00'),
};
vi.mock('@line-crm/db', () => dbMocks);

const attachMock = vi.fn(async () => ({ added: true }));
vi.mock('../services/friend-tag-attach.js', () => ({
  attachTagAndFireSideEffects: attachMock,
}));

vi.mock('../services/intro-message.js', () => ({ buildIntroMessage: vi.fn() }));

const pushMock = vi.fn(async () => undefined);
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: class {
    pushMessage = pushMock;
  },
}));

const { liffRoutes } = await import('./liff.js');

// Fake D1: handles the metadata SELECT/UPDATE, scenario lookup,
// and messages_log INSERT used by route-select.
function makeDb(metadata: string, options?: { activeScenarioTagIds?: string[] }) {
  const updates: Array<{ sql: string; args: unknown[] }> = [];
  const activeScenarioTagIds = new Set(options?.activeScenarioTagIds ?? []);
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT metadata')) return { metadata };
          if (sql.includes('FROM scenarios')) {
            return activeScenarioTagIds.has(args[0] as string) ? { 1: 1 } : null;
          }
          return null;
        },
        run: async () => {
          updates.push({ sql, args });
          return { meta: { changes: 1 } };
        },
      }),
    }),
    _updates: updates,
  };
  return db as unknown as D1Database & { _updates: typeof updates };
}

function post(body: unknown, db: unknown) {
  return liffRoutes.request(
    '/api/liff/route-select',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: db, LINE_CHANNEL_ACCESS_TOKEN: 'test-token' } as unknown,
  );
}

const FRIEND = { id: 'friend-1', line_account_id: null, line_user_id: 'U1' };
const CIRC_R_TAG = 'c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57';

describe('POST /api/liff/route-select', () => {
  beforeEach(() => {
    attachMock.mockClear();
    pushMock.mockClear();
    dbMocks.getFriendByLineUserId.mockReset();
    dbMocks.getLineAccountById.mockReset();
    dbMocks.getLineAccountById.mockResolvedValue(null);
  });

  test('不正な interest は 400', async () => {
    const res = await post({ lineUserId: 'U1', interest: 'unknown' }, makeDb('{}'));
    expect(res.status).toBe(400);
  });

  test('lineUserId 欠落は 400', async () => {
    const res = await post({ interest: 'ecg' }, makeDb('{}'));
    expect(res.status).toBe(400);
  });

  test('friend が見つからなければ 404', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    const res = await post({ lineUserId: 'U1', interest: 'ecg' }, makeDb('{}'));
    expect(res.status).toBe(404);
  });

  test('ecg は 200・nextPage=diagnosis・I/R 2タグ付与', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const res = await post({ lineUserId: 'U1', interest: 'ecg' }, makeDb('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { interest: string; label: string; nextPage: string | null } };
    expect(json.success).toBe(true);
    expect(json.data.interest).toBe('ecg');
    expect(json.data.nextPage).toBe('diagnosis');
    // I:心電図 と R:心電図 の2タグ
    expect(attachMock).toHaveBeenCalledTimes(2);
    expect(attachMock.mock.calls[0][2]).toBe('f8e2d40b-8ef1-45dc-924b-8dcf81982428');
    expect(attachMock.mock.calls[1][2]).toBe('4cdecec7-c40d-4fb1-b972-8e530dc60111');
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][1]).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('さっそく、あなたの航海マップ（60秒診断）から始めましょう'),
      },
    ]);
  });

  test('ecg 以外（circ）は 200・nextPage=null', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const res = await post({ lineUserId: 'U1', interest: 'circ' }, makeDb('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { interest: string; nextPage: string | null } };
    expect(json.data.interest).toBe('circ');
    expect(json.data.nextPage).toBeNull();
    expect(attachMock).toHaveBeenCalledTimes(2);
  });

  test('active な tag_added シナリオがあるルートは intro を送らず messages_log にも記録しない', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}', { activeScenarioTagIds: [CIRC_R_TAG] });
    const res = await post({ lineUserId: 'U1', interest: 'circ' }, db);

    expect(res.status).toBe(200);
    expect(pushMock).not.toHaveBeenCalled();
    expect(db._updates.some((u) => u.sql.includes('INSERT INTO messages_log'))).toBe(false);
  });

  test('active な tag_added シナリオがないルートは準備中 intro を送る', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}');
    const res = await post({ lineUserId: 'U1', interest: 'circ' }, db);

    expect(res.status).toBe(200);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][1]).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('いま、あなたにぴったりの航路を準備しています'),
      },
    ]);
    expect(db._updates.some((u) => u.sql.includes('INSERT INTO messages_log'))).toBe(true);
  });

  test('metadata.interests は重複追加しない', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{"interests":["ecg"]}');
    await post({ lineUserId: 'U1', interest: 'ecg' }, db);
    const update = db._updates.find((u) => u.sql.includes('UPDATE friends SET metadata'));
    expect(update).toBeTruthy();
    const merged = JSON.parse(update!.args[0] as string) as { interests: string[] };
    expect(merged.interests).toEqual(['ecg']); // 既存のみ・重複なし
  });

  test('metadata.interests に新規 interest を追記', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{"interests":["ecg"],"route_primary":"ecg"}');
    await post({ lineUserId: 'U1', interest: 'ai' }, db);
    const update = db._updates.find((u) => u.sql.includes('UPDATE friends SET metadata'));
    const merged = JSON.parse(update!.args[0] as string) as { interests: string[]; route_primary: string };
    expect(merged.interests).toEqual(['ecg', 'ai']);
    expect(merged.route_primary).toBe('ecg'); // 既存 route_primary は据え置き
  });
});
