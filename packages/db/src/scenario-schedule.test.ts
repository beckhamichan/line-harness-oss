import { describe, it, expect } from 'vitest';
import { computeNextDeliveryAt, clampToDeliveryWindow, type ScenarioRow, type StepRow } from './scenario-schedule.js';

const enrolledAt = new Date('2026-05-09T14:32:00+09:00');
const now = new Date('2026-05-09T14:32:00+09:00');

describe('computeNextDeliveryAt', () => {
  describe('relative mode', () => {
    it('adds delay_minutes to previousDeliveredAt', () => {
      const scenario: ScenarioRow = { delivery_mode: 'relative' };
      const step: StepRow = { delay_minutes: 60, offset_days: null, offset_minutes: null, delivery_time: null };
      const previous = new Date('2026-05-09T15:00:00+09:00');
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: previous, now });
      expect(result.toISOString()).toBe(new Date('2026-05-09T16:00:00+09:00').toISOString());
    });

    it('handles delay_minutes=0 (immediate)', () => {
      const scenario: ScenarioRow = { delivery_mode: 'relative' };
      const step: StepRow = { delay_minutes: 0, offset_days: null, offset_minutes: null, delivery_time: null };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(enrolledAt.toISOString());
    });
  });

  describe('elapsed mode', () => {
    it('adds offset_days*1440 + offset_minutes to enrolledAt', () => {
      const scenario: ScenarioRow = { delivery_mode: 'elapsed' };
      const step: StepRow = { delay_minutes: 0, offset_days: 1, offset_minutes: 120, delivery_time: null };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(new Date('2026-05-10T16:32:00+09:00').toISOString());
    });

    it('offset_days=0 offset_minutes=0 = immediate', () => {
      const scenario: ScenarioRow = { delivery_mode: 'elapsed' };
      const step: StepRow = { delay_minutes: 0, offset_days: 0, offset_minutes: 0, delivery_time: null };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(enrolledAt.toISOString());
    });

    it('handles month boundary', () => {
      const scenario: ScenarioRow = { delivery_mode: 'elapsed' };
      const step: StepRow = { delay_minutes: 0, offset_days: 25, offset_minutes: 0, delivery_time: null };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(new Date('2026-06-03T14:32:00+09:00').toISOString());
    });

    it('ignores previousDeliveredAt (anchored to enrolledAt)', () => {
      const scenario: ScenarioRow = { delivery_mode: 'elapsed' };
      const step: StepRow = { delay_minutes: 0, offset_days: 2, offset_minutes: 360, delivery_time: null };
      const farFuturePrev = new Date('2026-12-31T00:00:00+09:00');
      const result = computeNextDeliveryAt(scenario, step, {
        enrolledAt,
        previousDeliveredAt: farFuturePrev,
        now: enrolledAt,
      });
      expect(result.toISOString()).toBe(new Date('2026-05-11T20:32:00+09:00').toISOString());
    });
  });

  describe('absolute_time mode', () => {
    it('schedules for offset_days later at delivery_time HH:MM JST', () => {
      const scenario: ScenarioRow = { delivery_mode: 'absolute_time' };
      const step: StepRow = { delay_minutes: 0, offset_days: 1, offset_minutes: null, delivery_time: '09:00' };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(new Date('2026-05-10T09:00:00+09:00').toISOString());
    });

    it('clamps past time to now', () => {
      const scenario: ScenarioRow = { delivery_mode: 'absolute_time' };
      const step: StepRow = { delay_minutes: 0, offset_days: 0, offset_minutes: null, delivery_time: '09:00' };
      const result = computeNextDeliveryAt(scenario, step, { enrolledAt, previousDeliveredAt: enrolledAt, now });
      expect(result.toISOString()).toBe(now.toISOString());
    });

    it('handles year boundary', () => {
      const lateYear = new Date('2026-12-30T14:32:00+09:00');
      const scenario: ScenarioRow = { delivery_mode: 'absolute_time' };
      const step: StepRow = { delay_minutes: 0, offset_days: 5, offset_minutes: null, delivery_time: '08:00' };
      const result = computeNextDeliveryAt(scenario, step, {
        enrolledAt: lateYear,
        previousDeliveredAt: lateYear,
        now: lateYear,
      });
      expect(result.toISOString()).toBe(new Date('2027-01-04T08:00:00+09:00').toISOString());
    });
  });
});

// ※ このテストは TZ=JST 前提（既存 absolute_time テストと同じ規約）。
//   clampToDeliveryWindow は getHours/setHours を使うため JST ローカルで評価される。
describe('clampToDeliveryWindow（配信時間帯ガード JST 23:00〜翌7:00）', () => {
  const noJitter = () => 0; // → 7:00 ちょうど
  const maxJitter = () => 0.999; // → floor(0.999*31)=30 → 7:30

  it('日中(12:00)はそのまま', () => {
    const d = new Date('2026-06-23T12:00:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(d.toISOString());
  });

  it('22:59 はそのまま（禁止帯の直前）', () => {
    const d = new Date('2026-06-23T22:59:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(d.toISOString());
  });

  it('7:00 は配信可（そのまま）', () => {
    const d = new Date('2026-06-23T07:00:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(d.toISOString());
  });

  it('23:00 → 翌日 7:00', () => {
    const d = new Date('2026-06-23T23:00:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(new Date('2026-06-24T07:00:00+09:00').toISOString());
  });

  it('23:30 → 翌日 7:00', () => {
    const d = new Date('2026-06-23T23:30:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(new Date('2026-06-24T07:00:00+09:00').toISOString());
  });

  it('00:30 → 当日 7:00', () => {
    const d = new Date('2026-06-23T00:30:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(new Date('2026-06-23T07:00:00+09:00').toISOString());
  });

  it('06:59 → 当日 7:00', () => {
    const d = new Date('2026-06-23T06:59:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(new Date('2026-06-23T07:00:00+09:00').toISOString());
  });

  it('ジッタ最大で 7:30 に寄る', () => {
    const d = new Date('2026-06-23T01:00:00+09:00');
    expect(clampToDeliveryWindow(d, maxJitter).toISOString()).toBe(new Date('2026-06-23T07:30:00+09:00').toISOString());
  });

  it('月跨ぎ：6/30 23:30 → 7/1 7:00', () => {
    const d = new Date('2026-06-30T23:30:00+09:00');
    expect(clampToDeliveryWindow(d, noJitter).toISOString()).toBe(new Date('2026-07-01T07:00:00+09:00').toISOString());
  });

  it('繰り下げ後は必ず 7:00〜7:30 の範囲（ランダム30回）', () => {
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-06-23T02:00:00+09:00');
      const r = clampToDeliveryWindow(d); // 既定 Math.random
      // JST 7:00〜7:30 = UTC 前日22:00〜22:30
      const lo = new Date('2026-06-23T07:00:00+09:00').getTime();
      const hi = new Date('2026-06-23T07:30:00+09:00').getTime();
      expect(r.getTime()).toBeGreaterThanOrEqual(lo);
      expect(r.getTime()).toBeLessThanOrEqual(hi);
    }
  });
});
