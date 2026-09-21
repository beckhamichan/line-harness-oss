import { Hono } from 'hono';
import type { Env } from '../index.js';

const images = new Hono<Env>();

const MAX_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

type ImageMetadata = {
  contentType: string;
  originalFilename: string;
};

// POST /api/images — upload image (base64 or binary)
images.post('/api/images', async (c) => {
  try {
    const contentType = c.req.header('Content-Type') || '';

    let data: ArrayBuffer;
    let mimeType: string;
    let filename: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await c.req.json<{
        data: string;
        mimeType?: string;
        filename?: string;
      }>();

      if (!body.data) {
        return c.json({ success: false, error: 'data (base64) is required' }, 400);
      }

      let base64 = body.data;
      if (base64.startsWith('data:')) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64 = match[2];
        }
      }
      mimeType ??= body.mimeType ?? 'image/png';
      filename = body.filename;

      const binary = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      data = binary.buffer;
    } else {
      data = await c.req.arrayBuffer();
      mimeType = contentType.split(';')[0] || 'image/png';
    }

    if (data.byteLength > MAX_IMAGE_BYTES) {
      return c.json({ success: false, error: '画像は1MB以下に圧縮してからアップロードしてください' }, 400);
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as typeof ALLOWED_IMAGE_TYPES[number])) {
      return c.json({ success: false, error: `JPEGまたはPNGのみアップロードできます（受信形式: ${mimeType}）` }, 400);
    }

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const id = crypto.randomUUID();
    const key = `${id}.${ext}`;

    if (!c.env.IMAGE_UPLOADS) {
      return c.json({ success: false, error: '画像保存用KVが設定されていません' }, 503);
    }

    await c.env.IMAGE_UPLOADS.put(key, data, {
      metadata: {
        contentType: mimeType,
        originalFilename: filename ?? key,
      } satisfies ImageMetadata,
    });

    const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    const url = `${workerUrl}/images/${key}`;

    return c.json({
      success: true,
      data: { id, key, url, mimeType, size: data.byteLength },
    }, 201);
  } catch (err) {
    console.error('POST /api/images error:', err);
    return c.json({ success: false, error: '画像の保存に失敗しました' }, 500);
  }
});

// GET /images/:key — serve image (public, no auth)
images.get('/images/:key', async (c) => {
  try {
    if (!c.env.IMAGE_UPLOADS) {
      return c.json({ success: false, error: '画像保存用KVが設定されていません' }, 503);
    }

    const key = c.req.param('key');
    const object = await c.env.IMAGE_UPLOADS.getWithMetadata<ImageMetadata>(key, 'arrayBuffer');

    if (!object.value) {
      return c.json({ success: false, error: 'Image not found' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', object.metadata?.contentType || 'image/png');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag', `"${key}"`);

    return new Response(object.value, { headers });
  } catch (err) {
    console.error('GET /images/:key error:', err);
    return c.json({ success: false, error: '画像の読み込みに失敗しました' }, 500);
  }
});

// DELETE /api/images/:key — delete image
images.delete('/api/images/:key', async (c) => {
  try {
    const key = c.req.param('key');
    if (!c.env.IMAGE_UPLOADS) {
      return c.json({ success: false, error: '画像保存用KVが設定されていません' }, 503);
    }
    await c.env.IMAGE_UPLOADS.delete(key);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/images/:key error:', err);
    return c.json({ success: false, error: '画像の削除に失敗しました' }, 500);
  }
});

export { images };
