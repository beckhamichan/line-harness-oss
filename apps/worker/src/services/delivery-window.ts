/**
 * 配信禁止帯（JST 23:00〜翌7:00）の送信時ガード。
 *
 * 背景: PR #32 で `processStepDeliveries`（シナリオ配信）にだけ送信時ガードを入れたが、
 * 一斉配信（即時 / 予約 / 500人超の分割 / 複数アカウント重複除外 / テスト送信）には
 * ガードが無く、禁止帯でも送信できる状態だった（ISSUE-0080）。
 *
 * 方針は PR #32 と同じ:
 * - 予約は書き換えない。禁止帯の間は送らず、7:00 以降の最初の cron でそのまま送る
 * - 送信直前でも判定する。cron 停止 → 深夜復帰や、長い分割送信が 23:00 を跨ぐ場合に効く
 * - 例外は設けない（`AGENTS.md` §4。受信イベント内の reply token 応答のみが対象外）
 *
 * 判定は必ず **epoch から算術で** JST の時を出す。`Date#getHours()` は実行環境の
 * タイムゾーンで結果が変わり（Workers は UTC・開発機は JST）、テストと本番で
 * 挙動がズレる。配信安全の判定でそれは許容できない。
 */

// `packages/db/src/scenario-schedule.ts` と同じ値。ズレていないことは
// `delivery-window.test.ts` の同期テストで担保する。
const QUIET_START_HOUR = 23; // この時刻以降は禁止
const QUIET_END_HOUR = 7; // この時刻未満は禁止（= 7:00 から配信可）

/** epoch(ms) から JST の「時」(0-23) を出す。実行環境のタイムゾーンに依存しない。 */
export function jstHourOf(epochMs: number): number {
  return Math.floor((epochMs + 9 * 60 * 60_000) / 3_600_000) % 24;
}

/** 送信してよい時間帯か。 */
export function isDeliveryAllowed(epochMs: number = Date.now()): boolean {
  const hour = jstHourOf(epochMs);
  return hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR;
}

/** 禁止帯で送信しようとしたときに投げる。呼び出し側で 400 に変換する。 */
export class DeliveryWindowBlockedError extends Error {
  constructor() {
    super('配信禁止時間帯（JST 23:00〜翌7:00）のため送信できません。7:00以降に送信してください。');
    this.name = 'DeliveryWindowBlockedError';
  }
}

export function assertDeliveryAllowed(epochMs: number = Date.now()): void {
  if (!isDeliveryAllowed(epochMs)) throw new DeliveryWindowBlockedError();
}

/**
 * 予約日時が禁止帯に入っていないか。作成・更新時の入力検証に使う。
 * 禁止帯を指定しても送信時ガードが 7:00 まで保留するため事故にはならないが、
 * 「予約したのに送られていない」という分かりにくさを避けるため入口で弾く。
 *
 * @param scheduledAt ISO 8601 文字列（管理画面は `+09:00` 付きで送ってくる）
 * @returns 禁止帯なら true。日付として解釈できない場合は false（既存の扱いを変えない）
 */
export function isScheduledAtInQuietHours(scheduledAt: string | null | undefined): boolean {
  if (!scheduledAt) return false;
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return !isDeliveryAllowed(parsed.getTime());
}
