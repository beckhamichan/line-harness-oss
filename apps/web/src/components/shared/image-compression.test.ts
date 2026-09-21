import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  MAX_UPLOAD_IMAGE_BYTES,
  compressImageForUpload,
  getNextImageDimensions,
} from './image-compression'

class TestFile extends Blob {
  readonly name: string
  readonly lastModified: number

  constructor(parts: BlobPart[], name: string, options: FilePropertyBag = {}) {
    super(parts, options)
    this.name = name
    this.lastModified = options.lastModified ?? Date.now()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('compressImageForUpload', () => {
  test('1MB以下のJPEG/PNGは再エンコードせずそのまま返す', async () => {
    const file = new TestFile([new Uint8Array(100)], 'small.png', { type: 'image/png' }) as File
    await expect(compressImageForUpload(file)).resolves.toBe(file)
  })

  test('JPEG/PNG以外はアップロード前に理由付きで拒否する', async () => {
    const file = new TestFile([new Uint8Array(100)], 'image.gif', { type: 'image/gif' }) as File
    await expect(compressImageForUpload(file)).rejects.toThrow('JPEGまたはPNGのみ')
  })

  test('大きいJPEGをCanvasで1MB以下へ圧縮する', async () => {
    const close = vi.fn()
    vi.stubGlobal('File', TestFile)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2000, height: 1000, close })))

    const clearRect = vi.fn()
    const drawImage = vi.fn()
    const encodedSizes = [MAX_UPLOAD_IMAGE_BYTES + 100, MAX_UPLOAD_IMAGE_BYTES - 100]
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ clearRect, drawImage })),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        const size = encodedSizes.shift() ?? MAX_UPLOAD_IMAGE_BYTES - 100
        callback(new Blob([new Uint8Array(size)], { type }))
      }),
    }
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })

    const input = new TestFile(
      [new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 500)],
      'large.jpg',
      { type: 'image/jpeg', lastModified: 123 },
    ) as File

    const output = await compressImageForUpload(input)

    expect(output.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
    expect(output.type).toBe('image/jpeg')
    expect(output.name).toBe('large.jpg')
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('getNextImageDimensions', () => {
  test('縦横比を保ちつつ縮小する', () => {
    const next = getNextImageDimensions(2000, 1000, MAX_UPLOAD_IMAGE_BYTES * 4)
    expect(next.width).toBe(950)
    expect(next.height).toBe(475)
  })
})
