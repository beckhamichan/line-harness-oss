import type { DeliveryMode } from './scenarios.js';

export interface ScenarioRow {
  delivery_mode: DeliveryMode;
}

export interface StepRow {
  delay_minutes: number;
  offset_days: number | null;
  offset_minutes: number | null;
  delivery_time: string | null;
}

export interface ScheduleContext {
  /** friend_scenarios.started_at (JST) を Date に変換したもの */
  enrolledAt: Date;
  /** 前ステップ配信完了時刻 (relative mode で使用)。初回は enrolledAt と同じ */
  previousDeliveredAt: Date;
  /** 現在時刻 (JST)。absolute_time mode の過去時刻 clamp に使用 */
  now: Date;
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

// 配信禁止時間帯（JST）。21:00〜翌8:00 は配信しない。
const QUIET_START_HOUR = 21; // この時刻以降は禁止
const QUIET_END_HOUR = 8; // この時刻未満は禁止（= 8:00 から配信可）
const MORNING_JITTER_MINUTES = 30; // 繰り下げ先を 8:00〜8:30 に散らす

/**
 * 配信時間帯ガード：算出済みの配信時刻が JST 21:00〜翌8:00 の禁止帯に入る場合、
 * 直近の許可開始（8:00）以降へ繰り下げる。繰り下げ先は 8:00〜8:30 でジッタ。
 * 禁止帯外はそのまま返す（relative運用を維持し、最後にこれだけ適用する想定）。
 *
 * 入力 date は computeNextDeliveryAt と同じ「JST clock-time を表す Date」前提
 * （getHours/setHours/setDate が JST clock 通りに動く＝Workers実行時は local=UTC）。
 * rand はテスト用に注入可能（既定 Math.random）。
 */
export function clampToDeliveryWindow(date: Date, rand: () => number = Math.random): Date {
  const hour = date.getHours();
  const inQuiet = hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  if (!inQuiet) return date;

  const result = new Date(date);
  // 21:00 以降は「翌日」の朝へ。8:00 未満は「当日」の朝へ。
  if (hour >= QUIET_START_HOUR) {
    result.setDate(result.getDate() + 1);
  }
  const jitter = Math.floor(rand() * (MORNING_JITTER_MINUTES + 1)); // 0〜30 分
  result.setHours(QUIET_END_HOUR, jitter, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * 次配信時刻を計算する。delivery_mode に応じて 3 通りの計算を切り替える。
 *
 * - relative: previousDeliveredAt + delay_minutes
 * - elapsed: enrolledAt + (offset_days*1440 + offset_minutes) 分
 * - absolute_time: enrolledAt + offset_days 日後の delivery_time。過去なら now に丸める。
 */
export function computeNextDeliveryAt(
  scenario: ScenarioRow,
  step: StepRow,
  context: ScheduleContext,
): Date {
  switch (scenario.delivery_mode) {
    case 'relative':
      return addMinutes(context.previousDeliveredAt, step.delay_minutes ?? 0);

    case 'elapsed':
      return addMinutes(
        context.enrolledAt,
        (step.offset_days ?? 0) * 1440 + (step.offset_minutes ?? 0),
      );

    case 'absolute_time': {
      const target = addDays(context.enrolledAt, step.offset_days ?? 0);
      const [h, m] = (step.delivery_time ?? '00:00').split(':').map(Number);
      target.setHours(h, m, 0, 0);
      return target < context.now ? context.now : target;
    }
  }
}
