import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = {
  getBroadcastById: vi.fn(),
  updateBroadcastStatus: vi.fn(),
  jstNow: vi.fn(() => '2026-09-20T12:00:00+09:00'),
  updateBroadcastLineRequestId: vi.fn(),
  createBroadcastInsight: vi.fn(),
  getLineAccountById: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

const broadcastMocks = {
  getEffectiveBroadcastMessages: vi.fn(),
  autoTrackBroadcastMessages: vi.fn(),
  buildMessages: vi.fn(),
  addBatchMessageVariations: vi.fn(),
  createBroadcastMessageLogStatements: vi.fn(),
};
vi.mock('./broadcast.js', () => broadcastMocks);

vi.mock('./segment-query.js', () => ({
  buildSegmentQuery: () => ({ sql: 'SELECT id, line_user_id FROM friends WHERE 1 = 1', bindings: [] }),
}));

vi.mock('./stealth.js', () => ({
  calculateStaggerDelay: () => 0,
  sleep: async () => undefined,
}));

const { processSegmentSend } = await import('./segment-send.js');

describe('processSegmentSend message arrays', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 20, 3, 0)));
    vi.clearAllMocks();
  });

  it('uses one multicast call for the full ordered message array', async () => {
    const broadcast = {
      id: 'broadcast-1',
      message_type: 'text',
      message_content: 'legacy',
      line_account_id: null,
    };
    const source = [
      { position: 0, messageType: 'text', messageContent: 'first' },
      { position: 1, messageType: 'text', messageContent: 'second' },
    ];
    const messages = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ];
    dbMocks.getBroadcastById.mockResolvedValue(broadcast);
    broadcastMocks.getEffectiveBroadcastMessages.mockResolvedValue(source);
    broadcastMocks.autoTrackBroadcastMessages.mockResolvedValue(source);
    broadcastMocks.buildMessages.mockReturnValue(messages);
    broadcastMocks.addBatchMessageVariations.mockReturnValue(messages);
    const logStatements = [{ log: 0 }, { log: 1 }] as unknown as D1PreparedStatement[];
    broadcastMocks.createBroadcastMessageLogStatements.mockReturnValue(logStatements);

    const batch = vi.fn(async () => []);
    const db = {
      prepare() {
        const statement = {
          bind: (..._args: unknown[]) => statement,
          async all<T>() {
            return { results: [{ id: 'friend-1', line_user_id: 'U1' }] as T[] };
          },
        };
        return statement;
      },
      batch,
    } as unknown as D1Database;
    const lineClient = { multicast: vi.fn(async () => undefined) };

    await processSegmentSend(
      db,
      lineClient as never,
      'broadcast-1',
      { operator: 'AND', rules: [] },
      'https://worker.example',
    );

    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1'],
      messages,
      ['bcast_broadcas'],
    );
    expect(batch).toHaveBeenCalledWith(logStatements);
  });
});
