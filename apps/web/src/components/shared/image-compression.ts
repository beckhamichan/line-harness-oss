export const MAX_UPLOAD_IMAGE_BYTES = 1024 * 1024

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])
const MAX_INITIAL_DIMENSION = 4096
const MIN_JPEG_QUALITY = 0.5
const MAX_ATTEMPTS = 12

type LoadedImage = {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

export function getNextImageDimensions(
  width: number,
  height: number,
  encodedBytes: number,
  maxBytes = MAX_UPLOAD_IMAGE_BYTES,
): { width: number; height: number } {
  const sizeRatio = Math.sqrt(maxBytes / encodedBytes) * 0.95
  const scale = Math.min(0.85, Math.max(0.1, sizeRatio))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('画像の圧縮に失敗しました')),
      type,
      quality,
    )
  })
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('画像を読み込めませんでした'))
      image.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    throw err
  }
}

/** JPEG / PNG をブラウザ内だけで 1MB 以下へ圧縮する。 */
export async function compressImageForUpload(
  file: File,
  maxBytes = MAX_UPLOAD_IMAGE_BYTES,
): Promise<File> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('JPEGまたはPNGのみアップロードできます')
  }
  if (file.size <= maxBytes) return file

  const loaded = await loadImage(file)
  try {
    if (loaded.width < 1 || loaded.height < 1) {
      throw new Error('画像の大きさを確認できませんでした')
    }

    const initialScale = Math.min(1, MAX_INITIAL_DIMENSION / Math.max(loaded.width, loaded.height))
    let width = Math.max(1, Math.floor(loaded.width * initialScale))
    let height = Math.max(1, Math.floor(loaded.height * initialScale))
    let quality = file.type === 'image/jpeg' ? 0.9 : undefined

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('このブラウザでは画像を圧縮できません')

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      canvas.width = width
      canvas.height = height
      context.clearRect(0, 0, width, height)
      context.drawImage(loaded.source, 0, 0, width, height)

      const blob = await canvasToBlob(canvas, file.type, quality)
      if (blob.size <= maxBytes) {
        return new File([blob], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        })
      }

      if (file.type === 'image/jpeg' && quality !== undefined && quality > MIN_JPEG_QUALITY) {
        quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1)
        continue
      }

      const next = getNextImageDimensions(width, height, blob.size, maxBytes)
      if (next.width === width && next.height === height) break
      width = next.width
      height = next.height
      if (file.type === 'image/jpeg') quality = 0.85
    }

    throw new Error('1MB以下に圧縮できませんでした。別の画像を選択してください')
  } finally {
    loaded.cleanup()
  }
}
