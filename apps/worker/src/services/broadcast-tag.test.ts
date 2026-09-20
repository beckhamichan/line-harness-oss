import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = {
  getBroadcastById: vi.fn(),
  getBroadcasts: vi.fn(),
  getQueuedBroadcasts: vi.fn(),
  updateBroadcastStatus: vi.fn(),
  updateBroadcastBatchProgress: vi.fn(),
  getBroadcastMessages: vi.fn(),
  replaceBroadcastMessages: vi.fn(),
  getBroadcastTargetTagIds: vi.fn(),
  resolveTagBroadcastRecipients: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-09-20T12:00:00+09:00'),
  updateBroadcastLineRequestId: vi.fn(),
  createBroadcastInsight: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

const { processBroadcastSend, processQueuedBroadcasts } = await import('./broadcast.js');

function makeBroadcast() {
  return {
    id: 'broadcast-1',
    title: 'OR tags',
    message_type: 'text',
    message_content: 'hello',
    target_type: 'tag',
    target_tag_id: null,
    target_tag_ids: '["tag-a","tag-b"]',
    status: 'draft',
    scheduled_at: null,
    sent_at: null,
    total_count: 0,
    success_count: 0,
    created_at: '2026-09-20T11:00:00+09:00',
    account_ids: null,
    dedup_priority: null,
    failed_account_ids: null,
    dedup_progress: null,
    batch_lock_at: null,
    line_account_id: 'account-1',
  };
}

describe('processBroadcastSend tag recipients', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // 配信禁止帯ガード（ISSUE-0080）が入ったため、送信経路のテストは時刻を固定する。
    // 2026-09-20 12:00 JST = 03:00 UTC（許可帯）。
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 20, 3, 0, 0)));
    for (const mock of Object.values(dbMocks)) mock.mockReset();
    dbMocks.jstNow.mockReturnValue('2026-09-20T12:00:00+09:00');
    dbMocks.getBroadcastTargetTagIds.mockReturnValue(['tag-a', 'tag-b']);
    dbMocks.resolveTagBroadcastRecipients.mockResolvedValue([
      { id: 'friend-a', line_user_id: 'Ua' },
      { id: 'friend-b', line_user_id: 'Ub' },
    ]);
    dbMocks.getLineAccountById.mockResolvedValue(null);
    dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast());
    dbMocks.getBroadcastMessages.mockResolvedValue([]);
  });

  it('multicasts the shared OR-union once and preserves the account boundary', async () => {
    const prepared = { bind: vi.fn().mockReturnThis() };
    const db = {
      prepare: vi.fn(() => prepared),
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;
    const lineClient = {
      multicast: vi.fn().mockResolvedValue(undefined),
    };

    await processBroadcastSend(db, lineClient as never, 'broadcast-1');

    expect(dbMocks.resolveTagBroadcastRecipients).toHaveBeenCalledWith(db, {
      tagIds: ['tag-a', 'tag-b'],
      lineAccountId: 'account-1',
    });
    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['Ua', 'Ub'],
      [{ type: 'text', text: 'hello' }],
      ['bcast_broadcas'],
    );
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(dbMocks.updateBroadcastStatus).toHaveBeenLastCalledWith(
      db,
      'broadcast-1',
      'sent',
      { totalCount: 2, successCount: 2 },
    );
  });

  it('ignores the queue marker contents and resolves the saved tag list', async () => {
    dbMocks.getQueuedBroadcasts.mockResolvedValue([{
      ...makeBroadcast(),
      status: 'sending',
      line_account_id: null,
      batch_offset: 0,
      segment_conditions: '{"kind":"tag_or_queued"}',
    }]);
    const prepared = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    };
    const db = {
      prepare: vi.fn(() => prepared),
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;
    const lineClient = {
      multicast: vi.fn().mockResolvedValue(undefined),
    };

    await processQueuedBroadcasts(db, lineClient as never);

    expect(dbMocks.resolveTagBroadcastRecipients).toHaveBeenCalledWith(db, {
      tagIds: ['tag-a', 'tag-b'],
      lineAccountId: null,
    });
    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
  });
});
