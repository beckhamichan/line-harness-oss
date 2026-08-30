import { beforeEach, describe, expect, test, vi } from 'vitest';

const createTrackedLink = vi.hoisted(() => vi.fn());

vi.mock('@line-crm/db', () => ({ createTrackedLink }));

import { autoTrackContent } from './auto-track.js';

describe('autoTrackContent external browser flag', () => {
  beforeEach(() => {
    createTrackedLink.mockReset();
    createTrackedLink.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
  });

  test('Zoom URLのopenExternalBrowser=1を計測URLへ引き継ぐ', async () => {
    const source = '参加はこちら\nhttps://us06web.zoom.us/j/123?pwd=abc&openExternalBrowser=1';

    const result = await autoTrackContent(
      {} as D1Database,
      'text',
      source,
      'https://worker.example',
    );

    expect(result).toEqual({
      messageType: 'text',
      content: '参加はこちら\nhttps://worker.example/t/11111111-1111-4111-8111-111111111111?openExternalBrowser=1',
    });
    expect(createTrackedLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originalUrl: 'https://us06web.zoom.us/j/123?pwd=abc&openExternalBrowser=1',
      }),
    );
  });

  test('外部ブラウザ指定のない通常URLにはフラグを追加しない', async () => {
    const result = await autoTrackContent(
      {} as D1Database,
      'text',
      'https://example.com/page',
      'https://worker.example',
    );

    expect(result.content).toBe('https://worker.example/t/11111111-1111-4111-8111-111111111111');
  });
});
