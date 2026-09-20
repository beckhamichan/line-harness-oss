import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 一斉配信の送信経路が、配信禁止帯（JST 23:00〜翌7:00）で 1 通も送らないことを確かめる
 * （ISSUE-0080）。部品単体ではなく「LINE 送信が呼ばれないこと」を直接検証する。
 *
 * 2026-07-03 の事故（cron 停止 → 深夜復帰で滞留分が 0:55 に一斉配信）の再現を
 * 予約配信の経路で行う。
 */

const dbMocks = {
  getBroadcastById: vi.fn(),
  getBroadcasts: vi.fn(),
  getQueuedBroadcasts: vi.fn(),
  updateBroadcastStatus: vi.fn(),
  updateBroadcastBatchProgress: vi.fn(),
  getBroadcastMessages: vi.fn(),
  replaceBroadcastMessages: vi.fn(),
  getBroadcastTargetTagIds: vi.fn(() => ['tag-a']),
  resolveTagBroadcastRecipients: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-09-20T23:30:00+09:00'),
  updateBroadcastLineRequestId: vi.fn(),
  createBroadcastInsight: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

// バッチ間のステルス遅延は実時間の sleep なのでテストでは無効化する
// （本番の挙動は変えない。ここで測りたいのは「何通送ったか」だけ）。
vi.mock('./stealth.js', () => ({
  calculateStaggerDelay: () => 0,
  sleep: async () => undefined,
  addMessageVariation: (text: string) => text,
}));

const { processBroadcastSend, processScheduledBroadcasts, processQueuedBroadcasts } =
  await import('./broadcast.js');
const { DeliveryWindowBlockedError } = await import('./delivery-window.js');

/** JST の時刻を返すクロック（epoch ms）。UTC 基準で組み立てるので実行環境に依存しない。 */
const clock = (hour: number, minute = 0) => () => Date.UTC(2026, 8, 20, hour - 9, minute, 0, 0);

function makeBroadcast(overrides: Record<string, unknown> = {}) {
  return {
    id: 'broadcast-1',
    title: 'test',
    message_type: 'text',
    message_content: 'hello',
    target_type: 'tag',
    target_tag_id: 'tag-a',
    target_tag_ids: null,
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
    line_account_id: null,
    batch_offset: 0,
    segment_conditions: null,
    ...overrides,
  };
}

function makeLineClient() {
  return {
    broadcast: vi.fn(async () => ({ requestId: 'req-1' })),
    multicast: vi.fn(async () => undefined),
    pushMessage: vi.fn(async () => undefined),
  };
}

function makeDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes: 1 } })),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast());
  dbMocks.getBroadcastMessages.mockResolvedValue([]);
  dbMocks.getBroadcastTargetTagIds.mockReturnValue(['tag-a']);
  dbMocks.resolveTagBroadcastRecipients.mockResolvedValue([
    { id: 'f1', line_user_id: 'U1', is_following: 1 },
  ]);
});

describe('processBroadcastSend（即時・予約の実送信）', () => {
  it.each([
    ['23:00 ちょうど', 23, 0],
    ['23:59', 23, 59],
    ['0:00', 0, 0],
    ['0:55（2026-07-03 の事故時刻）', 0, 55],
    ['6:59', 6, 59],
  ])('%s は送信せずエラーになる', async (_label, hour, minute) => {
    const lineClient = makeLineClient();
    await expect(
      processBroadcastSend(makeDb(), lineClient as never, 'broadcast-1', undefined, clock(hour, minute)),
    ).rejects.toBeInstanceOf(DeliveryWindowBlockedError);

    expect(lineClient.multicast).not.toHaveBeenCalled();
    expect(lineClient.broadcast).not.toHaveBeenCalled();
  });

  it('status を sending に動かさない（下書きのまま残り 7:00 以降に送れる）', async () => {
    await expect(
      processBroadcastSend(makeDb(), makeLineClient() as never, 'broadcast-1', undefined, clock(2, 0)),
    ).rejects.toBeInstanceOf(DeliveryWindowBlockedError);

    expect(dbMocks.updateBroadcastStatus).not.toHaveBeenCalled();
  });

  it('7:00 ちょうどなら送信できる', async () => {
    const lineClient = makeLineClient();
    await processBroadcastSend(makeDb(), lineClient as never, 'broadcast-1', undefined, clock(7, 0));
    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
  });
});

describe('processScheduledBroadcasts（予約配信の cron）', () => {
  it('禁止帯では予約配信を1件も拾わない（滞留分の深夜一斉送信を防ぐ）', async () => {
    dbMocks.getBroadcasts.mockResolvedValue([
      makeBroadcast({ status: 'scheduled', scheduled_at: '2026-09-20T22:00:00+09:00' }),
    ]);
    const lineClient = makeLineClient();

    await processScheduledBroadcasts(makeDb(), lineClient as never, undefined, clock(0, 55));

    expect(dbMocks.getBroadcasts).not.toHaveBeenCalled();
    expect(lineClient.multicast).not.toHaveBeenCalled();
    expect(lineClient.broadcast).not.toHaveBeenCalled();
  });

  it('7:00 以降なら滞留していた予約をそのまま送る', async () => {
    dbMocks.getBroadcasts.mockResolvedValue([
      makeBroadcast({ status: 'scheduled', scheduled_at: '2026-09-20T22:00:00+09:00' }),
    ]);
    await processScheduledBroadcasts(makeDb(), makeLineClient() as never, undefined, clock(7, 0));
    expect(dbMocks.getBroadcasts).toHaveBeenCalled();
  });
});

describe('processQueuedBroadcasts（500人超の分割送信 cron）', () => {
  it('禁止帯ではキューを進めない', async () => {
    dbMocks.getQueuedBroadcasts.mockResolvedValue([makeBroadcast({ status: 'sending' })]);
    const lineClient = makeLineClient();

    await processQueuedBroadcasts(makeDb(), lineClient as never, undefined, clock(23, 30));

    expect(dbMocks.getQueuedBroadcasts).not.toHaveBeenCalled();
    expect(lineClient.multicast).not.toHaveBeenCalled();
  });

  it('送信中に 23:00 を跨いだら、その場で止めて offset を保存する（残りは再開）', async () => {
    // 1バッチ目は許可帯、2バッチ目の直前で禁止帯に入るクロック
    // nowFn は「cron 入口」「バッチ1の直前」「バッチ2の直前」…の順に呼ばれる。
    // 先頭2回を許可帯にして、3回目（2バッチ目の直前）で 23:00 に入らせる。
    let calls = 0;
    const crossingClock = () => {
      calls += 1;
      return calls <= 2
        ? Date.UTC(2026, 8, 20, 13, 59) // JST 22:59
        : Date.UTC(2026, 8, 20, 14, 0); // JST 23:00
    };
    dbMocks.getQueuedBroadcasts.mockResolvedValue([makeBroadcast({ status: 'sending' })]);
    // 501人 = 2バッチ
    dbMocks.resolveTagBroadcastRecipients.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({ id: `f${i}`, line_user_id: `U${i}`, is_following: 1 })),
    );
    const lineClient = makeLineClient();

    await processQueuedBroadcasts(makeDb(), lineClient as never, undefined, crossingClock);

    // 1バッチだけ送られ、2バッチ目は送られない
    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
    // 完了扱いにしない
    expect(dbMocks.updateBroadcastStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      'broadcast-1',
      'sent',
    );
    // 続きから再開できるよう offset を保存している
    expect(dbMocks.updateBroadcastBatchProgress).toHaveBeenCalled();
  });
});
