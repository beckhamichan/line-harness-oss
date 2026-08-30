import { describe, expect, test } from 'vitest';
import { matchesAutoReply } from './auto-reply-match.js';

describe('matchesAutoReply', () => {
  test('「セミナー」は部分一致で言い回しを許容する', () => {
    const rule = { keyword: 'セミナー', match_type: 'contains' as const };

    expect(matchesAutoReply(rule, 'セミナー参加します')).toBe(true);
    expect(matchesAutoReply(rule, 'ECG♡PASSのセミナーについて')).toBe(true);
  });

  test('既存の文房具完全一致とセミナー部分一致は重複ヒットしない', () => {
    const stationery = { keyword: 'ECG♡PASSの文房具一覧', match_type: 'exact' as const };
    const seminar = { keyword: 'セミナー', match_type: 'contains' as const };

    expect(matchesAutoReply(stationery, 'ECG♡PASSの文房具一覧')).toBe(true);
    expect(matchesAutoReply(seminar, 'ECG♡PASSの文房具一覧')).toBe(false);
    expect(matchesAutoReply(stationery, 'セミナー参加します')).toBe(false);
    expect(matchesAutoReply(seminar, 'セミナー参加します')).toBe(true);
  });
});
