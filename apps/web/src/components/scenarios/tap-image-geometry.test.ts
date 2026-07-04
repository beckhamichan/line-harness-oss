import { describe, expect, test } from 'vitest'
import { rectFromDrag } from './tap-image-geometry.js'

describe('rectFromDrag', () => {
  test('converts a top-left to bottom-right drag into percentages', () => {
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 100, y: 50 }, { width: 200, height: 100 })).toEqual({
      topPercent: 0,
      leftPercent: 0,
      widthPercent: 50,
      heightPercent: 50,
    })
  })

  test('normalizes reverse direction drags to the same rectangle', () => {
    expect(rectFromDrag({ x: 100, y: 50 }, { x: 0, y: 0 }, { width: 200, height: 100 })).toEqual({
      topPercent: 0,
      leftPercent: 0,
      widthPercent: 50,
      heightPercent: 50,
    })
  })

  test('clamps drags outside the image into the 0 to 100 percent range', () => {
    expect(rectFromDrag({ x: -20, y: -10 }, { x: 240, y: 120 }, { width: 200, height: 100 })).toEqual({
      topPercent: 0,
      leftPercent: 0,
      widthPercent: 100,
      heightPercent: 100,
    })
  })

  test('returns a zero-size rectangle for click-sized drags', () => {
    expect(rectFromDrag({ x: 40, y: 20 }, { x: 40, y: 20 }, { width: 200, height: 100 })).toEqual({
      topPercent: 20,
      leftPercent: 20,
      widthPercent: 0,
      heightPercent: 0,
    })
  })

  test('avoids division by zero when the image has no measurable size', () => {
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 100, y: 50 }, { width: 0, height: 0 })).toEqual({
      topPercent: 0,
      leftPercent: 0,
      widthPercent: 0,
      heightPercent: 0,
    })
  })
})
