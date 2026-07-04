export interface Point {
  x: number
  y: number
}

export interface ImageSize {
  width: number
  height: number
}

export interface PercentRect {
  topPercent: number
  leftPercent: number
  widthPercent: number
  heightPercent: number
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

export function rectFromDrag(start: Point, end: Point, imageSize: ImageSize): PercentRect {
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    return { topPercent: 0, leftPercent: 0, widthPercent: 0, heightPercent: 0 }
  }

  const leftPx = Math.min(start.x, end.x)
  const rightPx = Math.max(start.x, end.x)
  const topPx = Math.min(start.y, end.y)
  const bottomPx = Math.max(start.y, end.y)

  const leftPercent = clampPercent((leftPx / imageSize.width) * 100)
  const rightPercent = clampPercent((rightPx / imageSize.width) * 100)
  const topPercent = clampPercent((topPx / imageSize.height) * 100)
  const bottomPercent = clampPercent((bottomPx / imageSize.height) * 100)

  return {
    topPercent: roundPercent(topPercent),
    leftPercent: roundPercent(leftPercent),
    widthPercent: roundPercent(rightPercent - leftPercent),
    heightPercent: roundPercent(bottomPercent - topPercent),
  }
}
