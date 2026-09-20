import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = {
  getBroadcastById: vi.fn(),
  getBroadcasts: vi.fn(),
  getQueuedBroadcasts: vi.fn(),
  updateBroadcastStatus: vi.fn(),
  updateBroadcastBatchProgress: vi.fn(),
  getBroadcastMessages: vi.fn(),
  replaceBroadcastMessages: vi.fn(),
  getBroadcastTargetTagIds: vi.fn(() => ['tag-1']),
  resolveTagBroadcastRecipients: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-09-20T12:00:00+09:00'),
  updateBroadcastLineRequestId: vi.fn(),
  createBroadcastInsight: vi.fn(),
  createTrackedLink: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

vi.mock('./stealth.js', () => ({
  calculateStaggerDelay: () => 0,
  sleep: async () => undefined,
  addMessageVariation: (text: string, batchIndex: number) => `${text}#${batchIndex}`,
}));

const {
  buildMessages,
  autoTrackBroadcastMessages,
  getEffectiveBroadcastMessages,
  processBroadcastSend,
  processQueuedBroadcasts,
} = await import('./broadcast.js');

function makeBroadcast(overrides: Record<string, unknown> = {}) {
  return {
    id: 'broadcast-1',
    title: 'five messages',
    message_type: 'text',
    message_content: 'legacy text',
    alt_text: 'legacy alt',
    target_type: 'tag',
    target_tag_id: 'tag-1',
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
    ...overrides,
  };
}

function makeDb() {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          statement.binds = args;
          statements.push(statement);
          return statement;
        },
        async run() { return { meta: { changes: 1 } }; },
        async first<T>() { return null as T; },
        async all<T>() { return { results: [] as T[] }; },
      };
      return statement;
    },
    async batch(input: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(input);
      return [];
    },
  } as unknown as D1Database;
  return { db, statements, batches };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast());
  dbMocks.resolveTagBroadcastRecipients.mockResolvedValue([
    { id: 'friend-1', line_user_id: 'U1' },
    { id: 'friend-2', line_user_id: 'U2' },
  ]);
  dbMocks.getLineAccountById.mockResolvedValue(null);
  dbMocks.createTrackedLink.mockResolvedValue({ id: 'track-1' });
});

describe('ordered broadcast messages', () => {
  it('uses saved child rows in position order and builds mixed LINE messages', async () => {
    const broadcast = makeBroadcast();
    dbMocks.getBroadcastMessages.mockResolvedValue([
      { position: 0, message_type: 'text', message_content: 'hello {{liff_id}}', alt_text: null },
      {
        position: 1,
        message_type: 'image',
        message_content: JSON.stringify({
          originalContentUrl: 'https://example.test/original.jpg',
          previewImageUrl: 'https://example.test/preview.jpg',
        }),
        alt_text: null,
      },
      {
        position: 2,
        message_type: 'flex',
        message_content: JSON.stringify({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [] } }),
        alt_text: 'custom alt',
      },
    ]);

    const effective = await getEffectiveBroadcastMessages({} as D1Database, broadcast as never);
    const built = buildMessages(effective, 'LIFF123');

    expect(effective.map((message) => message.position)).toEqual([0, 1, 2]);
    expect(built).toEqual([
      { type: 'text', text: 'hello LIFF123' },
      {
        type: 'image',
        originalContentUrl: 'https://example.test/original.jpg',
        previewImageUrl: 'https://example.test/preview.jpg',
      },
      expect.objectContaining({ type: 'flex', altText: 'custom alt' }),
    ]);
  });

  it('falls back to the legacy parent columns when broadcast_messages is empty', async () => {
    const broadcast = makeBroadcast();
    dbMocks.getBroadcastMessages.mockResolvedValue([]);

    await expect(getEffectiveBroadcastMessages({} as D1Database, broadcast as never)).resolves.toEqual([
      {
        position: 0,
        messageType: 'text',
        messageContent: 'legacy text',
        altText: 'legacy alt',
      },
    ]);

    const lineClient = { multicast: vi.fn(async () => undefined) };
    await processBroadcastSend(
      makeDb().db,
      lineClient as never,
      'broadcast-1',
      undefined,
      () => Date.UTC(2026, 8, 20, 3, 0),
    );
    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1', 'U2'],
      [{ type: 'text', text: 'legacy text' }],
      ['bcast_broadcas'],
    );
  });

  it('applies URL tracking to each eligible message and leaves Flex JSON untouched', async () => {
    const flexContent = JSON.stringify({
      type: 'bubble',
      hero: { type: 'image', url: 'https://cdn.example.test/hero.jpg' },
    });
    const tracked = await autoTrackBroadcastMessages(
      {} as D1Database,
      [
        { position: 0, messageType: 'text', messageContent: 'open https://example.test/page' },
        { position: 1, messageType: 'text', messageContent: 'watch https://youtu.be/example' },
        { position: 2, messageType: 'flex', messageContent: flexContent, altText: 'hero' },
      ],
      'https://worker.example',
    );

    expect(tracked[0].messageContent).toContain('https://worker.example/t/track-1');
    expect(tracked[1].messageContent).toContain('openExternalBrowser=1');
    expect(tracked[2].messageContent).toBe(flexContent);
  });

  it('passes five messages to one multicast call and writes five logs per recipient', async () => {
    dbMocks.getBroadcastMessages.mockResolvedValue([
      { position: 0, message_type: 'text', message_content: 'one', alt_text: null },
      { position: 1, message_type: 'text', message_content: 'two', alt_text: null },
      { position: 2, message_type: 'text', message_content: 'three', alt_text: null },
      { position: 3, message_type: 'text', message_content: 'four', alt_text: null },
      { position: 4, message_type: 'text', message_content: 'five', alt_text: null },
    ]);
    const lineClient = { multicast: vi.fn(async () => undefined) };
    const { db, batches } = makeDb();

    await processBroadcastSend(
      db,
      lineClient as never,
      'broadcast-1',
      undefined,
      () => Date.UTC(2026, 8, 20, 3, 0),
    );

    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1', 'U2'],
      [
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
        { type: 'text', text: 'three' },
        { type: 'text', text: 'four' },
        { type: 'text', text: 'five' },
      ],
      ['bcast_broadcas'],
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].binds).toHaveLength(45);
    expect([7, 16, 25, 34, 43].map((index) => batches[0][0].binds[index])).toEqual([0, 1, 2, 3, 4]);
    expect([7, 16, 25, 34, 43].map((index) => batches[0][1].binds[index])).toEqual([0, 1, 2, 3, 4]);
  });

  it('passes the full array to the LINE broadcast API for all-followers delivery', async () => {
    dbMocks.getBroadcastById.mockResolvedValue(makeBroadcast({ target_type: 'all' }));
    dbMocks.getBroadcastMessages.mockResolvedValue([
      { position: 0, message_type: 'text', message_content: 'first', alt_text: null },
      { position: 1, message_type: 'text', message_content: 'second', alt_text: null },
    ]);
    const lineClient = { broadcast: vi.fn(async () => ({ requestId: 'request-1' })) };

    await processBroadcastSend(
      makeDb().db,
      lineClient as never,
      'broadcast-1',
      undefined,
      () => Date.UTC(2026, 8, 20, 3, 0),
    );

    expect(lineClient.broadcast).toHaveBeenCalledWith([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ]);
  });

  it('keeps every message together in one request on the queued batch path', async () => {
    const queued = makeBroadcast({ status: 'sending', batch_offset: 0, segment_conditions: null });
    dbMocks.getQueuedBroadcasts.mockResolvedValue([queued]);
    dbMocks.getBroadcastMessages.mockResolvedValue([
      { position: 0, message_type: 'text', message_content: 'first', alt_text: null },
      { position: 1, message_type: 'text', message_content: 'second', alt_text: null },
    ]);
    dbMocks.resolveTagBroadcastRecipients.mockResolvedValue([
      { id: 'friend-1', line_user_id: 'U1' },
    ]);
    const lineClient = { multicast: vi.fn(async () => undefined) };
    const { db } = makeDb();

    await processQueuedBroadcasts(
      db,
      lineClient as never,
      undefined,
      () => Date.UTC(2026, 8, 20, 3, 0),
    );

    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1'],
      [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
      ['bcast_broadcas'],
    );
  });
});
