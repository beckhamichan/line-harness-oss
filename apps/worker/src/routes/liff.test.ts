import { describe, expect, test, beforeEach, vi } from 'vitest';

// --- module mocks (must be defined before importing the route) ---
const dbMocks = {
  getFriendByLineUserId: vi.fn(),
  getLineAccountById: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getScenarios: vi.fn(),
  jstNow: vi.fn(() => '2026-06-21T12:00:00+09:00'),
};
vi.mock('@line-crm/db', () => dbMocks);

const fireEventMock = vi.fn();
vi.mock('../services/event-bus.js', () => ({
  fireEvent: fireEventMock,
}));

type FakeScenario = { id: string; trigger_tag_id: string; is_active: boolean };
type FakeState = {
  metadata: string;
  friendTags: Array<{ friend_id: string; tag_id: string }>;
  friendScenarios: Array<{ friend_id: string; scenario_id: string }>;
  tagEvents: Array<{ friend_id: string; tag_id: string }>;
  scenarios: FakeScenario[];
};

type FakeDb = D1Database & { _updates: Array<{ sql: string; args: unknown[] }>; _state: FakeState };

const attachMock = vi.fn(
  async (
    db: D1Database,
    friendId: string,
    tagId: string,
    options?: { enroll?: boolean },
  ) => {
    const state = (db as FakeDb)._state;
    if (!state.friendTags.some((t) => t.friend_id === friendId && t.tag_id === tagId)) {
      state.friendTags.push({ friend_id: friendId, tag_id: tagId });
      if (options?.enroll !== false) {
        const scenario = state.scenarios.find((s) => s.is_active && s.trigger_tag_id === tagId);
        if (
          scenario &&
          !state.friendScenarios.some(
            (row) => row.friend_id === friendId && row.scenario_id === scenario.id,
          )
        ) {
          state.friendScenarios.push({ friend_id: friendId, scenario_id: scenario.id });
        }
      }
      state.tagEvents.push({ friend_id: friendId, tag_id: tagId });
      return { added: true };
    }
    return { added: false };
  },
);
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

// Fake D1: handles the metadata SELECT/UPDATE, member-tag lookup,
// scenario lookup, and messages_log INSERT used by route-select/diagnosis.
function makeDb(metadata: string, options?: { activeScenarioTagIds?: string[]; friendTags?: Array<{ friend_id: string; tag_id: string }> }) {
  const updates: Array<{ sql: string; args: unknown[] }> = [];
  const activeScenarioTagIds = new Set(options?.activeScenarioTagIds ?? []);
  const state: FakeState = {
    metadata,
    friendTags: [...(options?.friendTags ?? [])],
    friendScenarios: [],
    tagEvents: [],
    scenarios: [...activeScenarioTagIds].map((tagId) => ({
      id: `scenario-for-${tagId}`,
      trigger_tag_id: tagId,
      is_active: true,
    })),
  };
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT metadata')) return { metadata: state.metadata };
          if (sql.includes('FROM friend_scenarios')) {
            return state.friendScenarios.some(
              (row) => row.friend_id === args[0] && row.scenario_id === args[1],
            )
              ? { id: 'existing' }
              : null;
          }
          if (sql.includes('FROM friend_tags')) {
            return state.friendTags.some(
              (row) => row.friend_id === args[0] && row.tag_id === args[1],
            )
              ? { 1: 1 }
              : null;
          }
          if (sql.includes('FROM scenarios')) {
            return activeScenarioTagIds.has(args[0] as string) ? { 1: 1 } : null;
          }
          return null;
        },
        run: async () => {
          updates.push({ sql, args });
          if (sql.includes('INSERT OR IGNORE INTO friend_tags')) {
            const [friendId, tagId] = args as [string, string, string];
            const exists = state.friendTags.some(
              (row) => row.friend_id === friendId && row.tag_id === tagId,
            );
            if (!exists) {
              state.friendTags.push({ friend_id: friendId, tag_id: tagId });
            }
            return { meta: { changes: exists ? 0 : 1 } };
          }
          if (sql.includes('UPDATE friends SET metadata')) {
            state.metadata = args[0] as string;
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
    _updates: updates,
    _state: state,
  };
  return db as unknown as FakeDb;
}

function postRouteSelect(body: unknown, db: unknown) {
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

function postDiagnosis(body: unknown, db: unknown) {
  return liffRoutes.request(
    '/api/liff/diagnosis',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: db, LINE_CHANNEL_ACCESS_TOKEN: 'test-token' } as unknown,
  );
}

const FRIEND = { id: 'friend-1', line_account_id: null, line_user_id: 'U1' };
const MEMBER_TAG = '5e3a934c-3d42-4409-a359-6a254588fb72';
const CIRC_I_TAG = 'b3545378-3204-4376-bc04-3b26bcaa0904';
const CIRC_R_TAG = 'c17ecb3c-1e3b-45bb-8f9d-cd3e56f78f57';
const DX_ONBOARDING_SCENARIO_ID = 'a8c02e28-beb1-4202-ac83-b39401a56e42';

describe('POST /api/liff/route-select', () => {
  beforeEach(() => {
    attachMock.mockClear();
    pushMock.mockClear();
    dbMocks.getFriendByLineUserId.mockReset();
    dbMocks.getLineAccountById.mockReset();
    dbMocks.getLineAccountById.mockResolvedValue(null);
    dbMocks.enrollFriendInScenario.mockReset();
    dbMocks.getScenarios.mockReset();
    fireEventMock.mockReset();
    dbMocks.enrollFriendInScenario.mockImplementation(async (db: D1Database, friendId: string, scenarioId: string) => {
      (db as FakeDb)._state.friendScenarios.push({ friend_id: friendId, scenario_id: scenarioId });
      return { id: `friend-scenario-${scenarioId}` };
    });
  });

  test('不正な interest は 400', async () => {
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'unknown' }, makeDb('{}'));
    expect(res.status).toBe(400);
  });

  test('lineUserId 欠落は 400', async () => {
    const res = await postRouteSelect({ interest: 'ecg' }, makeDb('{}'));
    expect(res.status).toBe(400);
  });

  test('friend が見つからなければ 404', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'ecg' }, makeDb('{}'));
    expect(res.status).toBe(404);
  });

  test('ecg は 200・nextPage=diagnosis・I/R 2タグ付与', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'ecg' }, makeDb('{}'));
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
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'circ' }, makeDb('{}'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { interest: string; nextPage: string | null } };
    expect(json.data.interest).toBe('circ');
    expect(json.data.nextPage).toBeNull();
    expect(attachMock).toHaveBeenCalledTimes(2);
  });

  test('active な tag_added シナリオがあるルートは intro を送らず messages_log にも記録しない', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}', { activeScenarioTagIds: [CIRC_R_TAG] });
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'circ' }, db);

    expect(res.status).toBe(200);
    expect(pushMock).not.toHaveBeenCalled();
    expect(db._updates.some((u) => u.sql.includes('INSERT INTO messages_log'))).toBe(false);
  });

  test('active な tag_added シナリオがないルートは準備中 intro を送る', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}');
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'circ' }, db);

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
    await postRouteSelect({ lineUserId: 'U1', interest: 'ecg' }, db);
    const update = db._updates.find((u) => u.sql.includes('UPDATE friends SET metadata'));
    expect(update).toBeTruthy();
    const merged = JSON.parse(update!.args[0] as string) as { interests: string[] };
    expect(merged.interests).toEqual(['ecg']); // 既存のみ・重複なし
  });

  test('metadata.interests に新規 interest を追記', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{"interests":["ecg"],"route_primary":"ecg"}');
    await postRouteSelect({ lineUserId: 'U1', interest: 'ai' }, db);
    const update = db._updates.find((u) => u.sql.includes('UPDATE friends SET metadata'));
    const merged = JSON.parse(update!.args[0] as string) as { interests: string[]; route_primary: string };
    expect(merged.interests).toEqual(['ecg', 'ai']);
    expect(merged.route_primary).toBe('ecg'); // 既存 route_primary は据え置き
  });

  test('会員は M/R/I タグを付与し、Rタグ経由の enroll は作らない', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}', { activeScenarioTagIds: [CIRC_R_TAG] });
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'circ', isMember: true }, db);

    expect(res.status).toBe(200);
    expect(db._state.friendTags).toEqual(
      expect.arrayContaining([
        { friend_id: FRIEND.id, tag_id: MEMBER_TAG },
        { friend_id: FRIEND.id, tag_id: CIRC_I_TAG },
        { friend_id: FRIEND.id, tag_id: CIRC_R_TAG },
      ]),
    );
    expect(db._state.friendScenarios).toEqual([]);
    expect(JSON.parse(db._state.metadata)).toMatchObject({ interests: ['circ'] });
    expect(attachMock).toHaveBeenLastCalledWith(db, FRIEND.id, CIRC_R_TAG, { enroll: false });
  });

  test('非会員は R/I タグを付与し、Rタグ経由の enroll を作る', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    const db = makeDb('{}', { activeScenarioTagIds: [CIRC_R_TAG] });
    const res = await postRouteSelect({ lineUserId: 'U1', interest: 'circ' }, db);

    expect(res.status).toBe(200);
    expect(db._state.friendTags).toEqual(
      expect.arrayContaining([
        { friend_id: FRIEND.id, tag_id: CIRC_I_TAG },
        { friend_id: FRIEND.id, tag_id: CIRC_R_TAG },
      ]),
    );
    expect(db._state.friendTags).not.toContainEqual({ friend_id: FRIEND.id, tag_id: MEMBER_TAG });
    expect(db._state.friendScenarios).toEqual([
      { friend_id: FRIEND.id, scenario_id: `scenario-for-${CIRC_R_TAG}` },
    ]);
    expect(JSON.parse(db._state.metadata)).toMatchObject({ interests: ['circ'] });
  });
});

describe('attachTagAndFireSideEffects', () => {
  beforeEach(() => {
    dbMocks.getScenarios.mockReset();
    dbMocks.enrollFriendInScenario.mockReset();
    fireEventMock.mockReset();
  });

  test('enroll:false はタグ付与と tag_change を残し、tag_added enroll だけ止める', async () => {
    const { attachTagAndFireSideEffects } =
      await vi.importActual<typeof import('../services/friend-tag-attach.js')>(
        '../services/friend-tag-attach.js',
      );
    dbMocks.getScenarios.mockResolvedValue([
      {
        id: 'scenario-1',
        trigger_type: 'tag_added',
        is_active: true,
        trigger_tag_id: CIRC_R_TAG,
      },
    ]);
    const db = makeDb('{}');

    const result = await attachTagAndFireSideEffects(db, FRIEND.id, CIRC_R_TAG, {
      enroll: false,
    });

    expect(result).toEqual({ added: true });
    expect(db._state.friendTags).toContainEqual({ friend_id: FRIEND.id, tag_id: CIRC_R_TAG });
    expect(dbMocks.getScenarios).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(fireEventMock).toHaveBeenCalledWith(db, 'tag_change', {
      friendId: FRIEND.id,
      eventData: { tagId: CIRC_R_TAG, action: 'add' },
    });
  });
});

describe('POST /api/liff/diagnosis', () => {
  beforeEach(() => {
    pushMock.mockClear();
    dbMocks.getFriendByLineUserId.mockReset();
    dbMocks.getFriendByLineUserId.mockResolvedValue(FRIEND);
    dbMocks.getLineAccountById.mockReset();
    dbMocks.getLineAccountById.mockResolvedValue(null);
    dbMocks.enrollFriendInScenario.mockReset();
    dbMocks.getScenarios.mockReset();
    fireEventMock.mockReset();
    dbMocks.enrollFriendInScenario.mockImplementation(async (db: D1Database, friendId: string, scenarioId: string) => {
      (db as FakeDb)._state.friendScenarios.push({ friend_id: friendId, scenario_id: scenarioId });
      return { id: `friend-scenario-${scenarioId}` };
    });
  });

  test('M:会員タグありなら診断後の7日間オンボーディング enroll は作らない', async () => {
    const db = makeDb('{}', { friendTags: [{ friend_id: FRIEND.id, tag_id: MEMBER_TAG }] });
    const res = await postDiagnosis({ lineUserId: 'U1', type: 'F', scores: { F: 3 } }, db);

    expect(res.status).toBe(200);
    expect(db._state.friendScenarios).toEqual([]);
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  test('M:会員タグなしなら診断後の7日間オンボーディング enroll を作る', async () => {
    const db = makeDb('{}');
    const res = await postDiagnosis({ lineUserId: 'U1', type: 'F', scores: { F: 3 } }, db);

    expect(res.status).toBe(200);
    expect(db._state.friendScenarios).toEqual([
      { friend_id: FRIEND.id, scenario_id: DX_ONBOARDING_SCENARIO_ID },
    ]);
    expect(dbMocks.enrollFriendInScenario).toHaveBeenCalledWith(
      db,
      FRIEND.id,
      DX_ONBOARDING_SCENARIO_ID,
    );
    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});
