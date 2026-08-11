import { describe, expect, it } from 'vitest';
import { getPendingInsights } from '../src/broadcasts.js';

function toJstOffsetString(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.toISOString().slice(0, 19)}+09:00`;
}

function makeD1(rows: Array<Record<string, unknown>>, sqlAssertions: (sql: string) => void): D1Database {
  return {
    prepare(sql: string) {
      sqlAssertions(sql);
      const stmt = {
        async all<T>() {
          const now = Date.now();
          return {
            results: rows.filter((row) => {
              if (row.status !== 'pending' || !row.sent_at) return false;
              return (now - new Date(row.sent_at as string).getTime()) / (24 * 60 * 60 * 1000) >= 3;
            }) as T[],
          };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function pendingInsightRow(broadcastId: string, sentAt: string): Record<string, unknown> {
  return {
    insight_id: `insight-${broadcastId}`,
    broadcast_id: broadcastId,
    retry_count: 0,
    line_request_id: 'line-request-id',
    aggregation_unit: null,
    sent_at: sentAt,
    line_account_id: null,
    target_type: 'all',
    account_ids: null,
    failed_account_ids: null,
    success_count: 1,
    status: 'pending',
  };
}

describe('getPendingInsights', () => {
  it('uses real elapsed time for +09:00 sent_at values', async () => {
    const rows = [
      pendingInsightRow(
        'sent-63h-ago',
        toJstOffsetString(new Date(Date.now() - 63 * 60 * 60 * 1000)),
      ),
      pendingInsightRow(
        'sent-72h-ago',
        toJstOffsetString(new Date(Date.now() - (72 * 60 + 1) * 60 * 1000)),
      ),
    ];

    const pending = await getPendingInsights(makeD1(rows, (sql) => {
      expect(sql).toContain("julianday('now') - julianday(b.sent_at) >= 3");
      expect(sql).not.toContain("julianday('now', '+9 hours')");
    }));

    expect(pending.map((item) => item.broadcastId)).toEqual(['sent-72h-ago']);
  });
});
