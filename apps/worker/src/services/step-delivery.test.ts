import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateCondition, expandVariables, isSupportedConditionType, SUPPORTED_CONDITION_TYPES } from './step-delivery.js';

/**
 * Regression coverage for OSS issue #120 — scenario step
 * conditionType/conditionValue must be evaluated at delivery time, and
 * unknown / malformed conditions must fail safe (skip step) rather than
 * silently treat them as "always pass" (which would over-deliver).
 */

interface FakeTables {
  friendTags?: Set<string>; // "friendId|tagId" entries
  friendMetadata?: Record<string, Record<string, unknown>>; // friendId → metadata
}

function mockDb(tables: FakeTables): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async <T = unknown>(): Promise<T | null> => {
          if (sql.includes('FROM friend_tags')) {
            const [friendId, tagId] = args as [string, string];
            return (tables.friendTags?.has(`${friendId}|${tagId}`) ? ({ 1: 1 } as unknown as T) : null);
          }
          if (sql.includes('FROM friends')) {
            const [friendId] = args as [string];
            const meta = tables.friendMetadata?.[friendId];
            if (meta === undefined) return null;
            return { metadata: JSON.stringify(meta) } as unknown as T;
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 0 } }),
      }),
    }),
  } as unknown as D1Database;
}

describe('isSupportedConditionType', () => {
  it('accepts each value in SUPPORTED_CONDITION_TYPES', () => {
    for (const t of SUPPORTED_CONDITION_TYPES) {
      expect(isSupportedConditionType(t)).toBe(true);
    }
  });

  it.each(['tag_not_has', 'TAG_EXISTS', '', null, undefined, 42])(
    'rejects unsupported value %j',
    (val) => {
      expect(isSupportedConditionType(val)).toBe(false);
    },
  );
});

describe('evaluateCondition', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns true when condition_type is null (no condition set)', async () => {
    const db = mockDb({});
    expect(await evaluateCondition(db, 'f1', { condition_type: null, condition_value: null })).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns false (skip) when condition_type is set but condition_value is empty', async () => {
    // Fail-safe for malformed stored rows: a configured condition without a value
    // would otherwise bind '' into SQL and produce over-delivery (OSS #120 pattern).
    const db = mockDb({});
    expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_exists', condition_value: '' })).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns false (skip) when condition_type is set but condition_value is null', async () => {
    const db = mockDb({});
    expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_not_exists', condition_value: null })).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  describe('tag_exists', () => {
    it('returns true when the friend has the tag', async () => {
      const db = mockDb({ friendTags: new Set(['f1|tag-A']) });
      expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_exists', condition_value: 'tag-A' })).toBe(true);
    });
    it('returns false when the friend does not have the tag', async () => {
      const db = mockDb({ friendTags: new Set() });
      expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_exists', condition_value: 'tag-A' })).toBe(false);
    });
  });

  describe('tag_not_exists', () => {
    it('returns true when the friend does not have the tag', async () => {
      const db = mockDb({ friendTags: new Set() });
      expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_not_exists', condition_value: 'tag-A' })).toBe(true);
    });
    it('returns false when the friend has the excluded tag', async () => {
      const db = mockDb({ friendTags: new Set(['f1|tag-A']) });
      expect(await evaluateCondition(db, 'f1', { condition_type: 'tag_not_exists', condition_value: 'tag-A' })).toBe(false);
    });
  });

  describe('metadata_equals', () => {
    it('returns true when the metadata matches', async () => {
      const db = mockDb({ friendMetadata: { f1: { purchased: 'true' } } });
      expect(
        await evaluateCondition(db, 'f1', {
          condition_type: 'metadata_equals',
          condition_value: JSON.stringify({ key: 'purchased', value: 'true' }),
        }),
      ).toBe(true);
    });
    it('returns false when the metadata key is absent', async () => {
      const db = mockDb({ friendMetadata: { f1: {} } });
      expect(
        await evaluateCondition(db, 'f1', {
          condition_type: 'metadata_equals',
          condition_value: JSON.stringify({ key: 'purchased', value: 'true' }),
        }),
      ).toBe(false);
    });
  });

  describe('metadata_not_equals', () => {
    it('returns false when the metadata equals the excluded value', async () => {
      const db = mockDb({ friendMetadata: { f1: { tier: 'gold' } } });
      expect(
        await evaluateCondition(db, 'f1', {
          condition_type: 'metadata_not_equals',
          condition_value: JSON.stringify({ key: 'tier', value: 'gold' }),
        }),
      ).toBe(false);
    });
    it('returns true when the metadata differs from the excluded value', async () => {
      const db = mockDb({ friendMetadata: { f1: { tier: 'silver' } } });
      expect(
        await evaluateCondition(db, 'f1', {
          condition_type: 'metadata_not_equals',
          condition_value: JSON.stringify({ key: 'tier', value: 'gold' }),
        }),
      ).toBe(true);
    });
  });

  describe('fail-safe semantics (OSS #120 regression)', () => {
    it('unknown condition_type → false (skip), NOT true (deliver)', async () => {
      // OSS issue #120: user passed condition_type='tag_not_has' (typo for tag_not_exists);
      // pre-fix behaviour was to fall through to default and return true → over-deliver to every
      // friend regardless of the configured filter. Lock in fail-safe = skip.
      const db = mockDb({ friendTags: new Set(['f1|tag-A']) });
      const result = await evaluateCondition(db, 'f1', {
        condition_type: 'tag_not_has',
        condition_value: 'tag-A',
      });
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('malformed condition_value JSON for metadata_equals → false (skip)', async () => {
      const db = mockDb({ friendMetadata: { f1: { tier: 'gold' } } });
      const result = await evaluateCondition(db, 'f1', {
        condition_type: 'metadata_equals',
        condition_value: '{this is not json',
      });
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('condition_value missing "key" → false (skip)', async () => {
      const db = mockDb({ friendMetadata: { f1: { tier: 'gold' } } });
      const result = await evaluateCondition(db, 'f1', {
        condition_type: 'metadata_equals',
        condition_value: JSON.stringify({ value: 'gold' }),
      });
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('condition_value missing "value" key → false (skip; would otherwise match undefined keys)', async () => {
      // Pre-existing rows could have {"key":"tier"} (no "value"). Without the explicit
      // 'value' in parsed check, metadata_equals compares actual === undefined and would
      // pass for every friend who lacks the key — recreating the OSS #120 over-delivery.
      const db = mockDb({ friendMetadata: { f1: {} } });
      const result = await evaluateCondition(db, 'f1', {
        condition_type: 'metadata_equals',
        condition_value: JSON.stringify({ key: 'tier' }),
      });
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('friend metadata stored as invalid JSON → treated as empty map (does not throw)', async () => {
      const db = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ metadata: '{not json' }),
          }),
        }),
      } as unknown as D1Database;
      const result = await evaluateCondition(db, 'f1', {
        condition_type: 'metadata_equals',
        condition_value: JSON.stringify({ key: 'tier', value: 'gold' }),
      });
      // metadata defaults to {} → key is absent → not equal → returns false
      expect(result).toBe(false);
    });
  });
});

describe('expandVariables — {{type_tip:dayN}} 診断タイプ別差し込み', () => {
  const baseFriend = { id: 'friend-1', display_name: 'テスト太郎', user_id: 'U-uuid-1', ref_code: null as string | null };
  const day3 = '本文。\n{{type_tip:day3}}';
  const day5 = '本文。\n{{type_tip:day5}}';

  const cases: Array<[string, 'day3' | 'day5', string]> = [
    ['F', 'day3', '一個ずつ、確実に'],
    ['P', 'day3', 'スピード判読の感覚'],
    ['V', 'day3', '目に焼き付けて'],
    ['L', 'day3', '“語れる”側です'],
    ['F', 'day5', 'コツコツ勉強会'],
    ['P', 'day5', '検定チャレンジコース'],
    ['V', 'day5', '判読会シリーズ'],
    ['L', 'day5', '臨床推論型の勉強会'],
  ];
  for (const [type, day, needle] of cases) {
    it(`type=${type} の ${day} は専用文が入る`, () => {
      const tpl = day === 'day3' ? day3 : day5;
      const out = expandVariables(tpl, { ...baseFriend, metadata: { diagnosis_type: type } });
      expect(out).toContain(needle);
      expect(out).not.toContain('{{type_tip');
    });
  }

  it('未診断（diagnosis_type 無し）は中立フォールバック文', () => {
    const out3 = expandVariables(day3, { ...baseFriend, metadata: {} });
    const out5 = expandVariables(day5, { ...baseFriend, metadata: {} });
    expect(out3).toContain('一緒に少しずつ波を読めるように');
    expect(out5).toContain('あなたのペースで楽しめる場所');
    expect(out3).not.toContain('{{type_tip');
    expect(out5).not.toContain('{{type_tip');
  });

  it('不正な diagnosis_type もフォールバックで破綻しない', () => {
    const out = expandVariables(day3, { ...baseFriend, metadata: { diagnosis_type: 'X' } });
    expect(out).toContain('一緒に少しずつ波を読めるように');
    expect(out).not.toContain('{{type_tip');
  });

  it('{{metadata.diagnosis_label}} は従来どおり展開される', () => {
    const out = expandVariables('あなたは{{metadata.diagnosis_label}}です', {
      ...baseFriend,
      metadata: { diagnosis_label: '語れるようになりたいタイプ' },
    });
    expect(out).toBe('あなたは語れるようになりたいタイプです');
  });
});
