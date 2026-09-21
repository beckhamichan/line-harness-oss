import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { images } from './images.js';

type StoredImage = {
  value: ArrayBuffer;
  metadata: { contentType: string; originalFilename: string } | null;
};

function makeKvStub() {
  const stored = new Map<string, StoredImage>();
  const kv = {
    async put(key: string, value: ArrayBuffer, options?: { metadata?: StoredImage['metadata'] }) {
      stored.set(key, { value: value.slice(0), metadata: options?.metadata ?? null });
    },
    async getWithMetadata(key: string) {
      const entry = stored.get(key);
      return entry
        ? { value: entry.value.slice(0), metadata: entry.metadata, cacheStatus: null }
        : { value: null, metadata: null, cacheStatus: null };
    },
    async delete(key: string) {
      stored.delete(key);
    },
  } as unknown as KVNamespace;
  return { kv, stored };
}

function setupApp(kv?: KVNamespace) {
  const app = new Hono<Env>();
  app.route('/', images);
  const bindings = {
    IMAGE_UPLOADS: kv,
    WORKER_URL: 'https://images.example.test',
  } as Env['Bindings'];
  return (path: string, init?: RequestInit) => app.request(path, init, bindings);
}

describe('image routes with Workers KV', () => {
  test('JPEGをKVへ保存し、同じ公開URLから配信する', async () => {
    const { kv, stored } = makeKvStub();
    const request = setupApp(kv);
    const source = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

    const upload = await request('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: source,
    });

    expect(upload.status).toBe(201);
    const body = await upload.json() as {
      success: boolean;
      data: { key: string; url: string; mimeType: string; size: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.key).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect(body.data.url).toBe(`https://images.example.test/images/${body.data.key}`);
    expect(body.data).toMatchObject({ mimeType: 'image/jpeg', size: source.byteLength });
    expect(stored.get(body.data.key)?.metadata?.contentType).toBe('image/jpeg');

    const served = await request(`/images/${body.data.key}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/jpeg');
    expect(served.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(source);
  });

  test('1MB超過とJPEG/PNG以外を理由付きで拒否する', async () => {
    const { kv } = makeKvStub();
    const request = setupApp(kv);

    const tooLarge = await request('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(1024 * 1024 + 1),
    });
    expect(tooLarge.status).toBe(400);
    await expect(tooLarge.json()).resolves.toMatchObject({ error: expect.stringContaining('1MB以下') });

    const unsupported = await request('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/gif' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(unsupported.status).toBe(400);
    await expect(unsupported.json()).resolves.toMatchObject({ error: expect.stringContaining('JPEGまたはPNG') });
  });

  test('KV bindingが無い場合は設定不足の理由を返す', async () => {
    const request = setupApp();
    const response = await request('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: '画像保存用KVが設定されていません' });
  });

  test('DELETEでKVから画像を削除する', async () => {
    const { kv, stored } = makeKvStub();
    stored.set('delete-me.png', {
      value: new Uint8Array([1]).buffer,
      metadata: { contentType: 'image/png', originalFilename: 'delete-me.png' },
    });
    const request = setupApp(kv);

    const response = await request('/api/images/delete-me.png', { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(stored.has('delete-me.png')).toBe(false);
  });
});
