import { describe, it, expect } from 'vitest';
import {
  isDeliveryAllowed,
  assertDeliveryAllowed,
  isScheduledAtInQuietHours,
  jstHourOf,
  DeliveryWindowBlockedError,
} from './delivery-window.js';

/**
 * 配信禁止帯（JST 23:00〜翌7:00）の境界テスト。
 * `AGENTS.md` §4 が要求する 23:00 / 23:59 / 0:00 / 6:59 / 7:00 を必ず含める。
 *
 * 判定は epoch から算術で行うため、このテストは実行環境のタイムゾーンに依存しない。
 */
/** JST の時刻を epoch(ms) にする。UTC 基準で組み立てるので実行環境に依存しない。 */
const jst = (hour: number, minute = 0) => Date.UTC(2026, 8, 20, hour - 9, minute, 0, 0);

describe('isDeliveryAllowed — 禁止帯の境界', () => {
  it.each([
    ['23:00 ちょうど（禁止の開始）', 23, 0, false],
    ['23:59（禁止帯の中）', 23, 59, false],
    ['0:00（日付をまたいでも禁止）', 0, 0, false],
    ['6:59（禁止の最後の1分）', 6, 59, false],
    ['7:00 ちょうど（ここから許可）', 7, 0, true],
    ['7:01（許可帯）', 7, 1, true],
    ['22:59（禁止の直前・許可）', 22, 59, true],
    ['0:55（2026-07-03 の深夜配信事故と同じ時刻）', 0, 55, false],
    ['12:00（日中）', 12, 0, true],
  ])('%s', (_label, hour, minute, expected) => {
    expect(isDeliveryAllowed(jst(hour, minute))).toBe(expected);
  });
});

describe('assertDeliveryAllowed', () => {
  it('禁止帯では DeliveryWindowBlockedError を投げる', () => {
    expect(() => assertDeliveryAllowed(jst(23, 30))).toThrow(DeliveryWindowBlockedError);
  });

  it('許可帯では何も起きない', () => {
    expect(() => assertDeliveryAllowed(jst(9, 0))).not.toThrow();
  });

  it('エラーメッセージが利用者にそのまま出せる日本語である', () => {
    try {
      assertDeliveryAllowed(jst(2, 0));
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('23:00');
      expect((err as Error).message).toContain('7:00以降');
    }
  });
});

describe('isScheduledAtInQuietHours — 予約日時の入口チェック', () => {
  it.each([
    ['23:00 JST の予約は弾く', '2026-09-20T23:00:00.000+09:00', true],
    ['23:59 JST の予約は弾く', '2026-09-20T23:59:00.000+09:00', true],
    ['0:00 JST の予約は弾く', '2026-09-21T00:00:00.000+09:00', true],
    ['6:59 JST の予約は弾く', '2026-09-21T06:59:00.000+09:00', true],
    ['7:00 JST の予約は通す', '2026-09-21T07:00:00.000+09:00', false],
    ['22:59 JST の予約は通す', '2026-09-20T22:59:00.000+09:00', false],
  ])('%s', (_label, iso, expected) => {
    expect(isScheduledAtInQuietHours(iso)).toBe(expected);
  });

  it('UTC 表記で渡ってきても JST に直して判定する（14:00Z = 23:00 JST）', () => {
    expect(isScheduledAtInQuietHours('2026-09-20T14:00:00.000Z')).toBe(true);
    expect(isScheduledAtInQuietHours('2026-09-20T13:59:00.000Z')).toBe(false);
  });

  it('未指定（即時配信）や壊れた値は弾かない（既存の扱いを変えない）', () => {
    expect(isScheduledAtInQuietHours(null)).toBe(false);
    expect(isScheduledAtInQuietHours(undefined)).toBe(false);
    expect(isScheduledAtInQuietHours('')).toBe(false);
    expect(isScheduledAtInQuietHours('not-a-date')).toBe(false);
  });
});


describe('jstHourOf — タイムゾーンに依存しないこと', () => {
  it('UTC 14:00 は JST 23:00', () => {
    expect(jstHourOf(Date.UTC(2026, 8, 20, 14, 0))).toBe(23);
  });

  it('UTC 22:00 は翌日の JST 7:00', () => {
    expect(jstHourOf(Date.UTC(2026, 8, 20, 22, 0))).toBe(7);
  });

  it('UTC 15:00 は JST 0:00（日付をまたぐ）', () => {
    expect(jstHourOf(Date.UTC(2026, 8, 20, 15, 0))).toBe(0);
  });
});
