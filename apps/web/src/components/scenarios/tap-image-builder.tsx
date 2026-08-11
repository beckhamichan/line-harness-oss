'use client'

import { type PointerEvent, type SyntheticEvent, useRef, useState } from 'react'
import { tapImageMessage } from '@line-crm/line-sdk'
import { type Point, type PercentRect, rectFromDrag } from './tap-image-geometry'

interface TapAreaInput {
  label: string
  topPercent: string
  leftPercent: string
  widthPercent: string
  heightPercent: string
  uri: string
}

interface TapImageBuilderProps {
  onGenerate: (messageContentJson: string) => void
  hasExistingContent: boolean
  title?: string
  description?: string
  defaultOpen?: boolean
}

function emptyTapArea(): TapAreaInput {
  return { label: '', topPercent: '', leftPercent: '', widthPercent: '', heightPercent: '', uri: '' }
}

function isBlankArea(area: TapAreaInput): boolean {
  return (
    !area.label.trim() &&
    !area.uri.trim() &&
    !area.topPercent.trim() &&
    !area.leftPercent.trim() &&
    !area.widthPercent.trim() &&
    !area.heightPercent.trim()
  )
}

function areaFromRect(rect: PercentRect): TapAreaInput {
  return {
    ...emptyTapArea(),
    topPercent: String(rect.topPercent),
    leftPercent: String(rect.leftPercent),
    widthPercent: String(rect.widthPercent),
    heightPercent: String(rect.heightPercent),
  }
}

function numericAreaRect(area: TapAreaInput): PercentRect | null {
  const topPercent = Number(area.topPercent)
  const leftPercent = Number(area.leftPercent)
  const widthPercent = Number(area.widthPercent)
  const heightPercent = Number(area.heightPercent)
  if ([topPercent, leftPercent, widthPercent, heightPercent].some((value) => !Number.isFinite(value))) {
    return null
  }
  if (widthPercent <= 0 || heightPercent <= 0) return null
  return { topPercent, leftPercent, widthPercent, heightPercent }
}

export default function TapImageBuilder({
  onGenerate,
  hasExistingContent,
  title = 'タップ画像ビルダー(任意) - 1枚の画像に複数のタップ領域を設定',
  description,
  defaultOpen,
}: TapImageBuilderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false)
  const [imageUrl, setImageUrl] = useState('')
  const [altText, setAltText] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [areas, setAreas] = useState<TapAreaInput[]>([emptyTapArea()])
  const [error, setError] = useState('')
  const [selectedAreaIndex, setSelectedAreaIndex] = useState<number | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [dragPreview, setDragPreview] = useState<PercentRect | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const resetImageState = (nextImageUrl: string) => {
    setImageUrl(nextImageUrl)
    setImageReady(false)
    setImageLoadFailed(false)
    setDragStart(null)
    setDragPreview(null)
  }

  const updateArea = (index: number, patch: Partial<TapAreaInput>) => {
    setAreas((prev) => prev.map((area, i) => (i === index ? { ...area, ...patch } : area)))
  }

  const addArea = () => {
    setSelectedAreaIndex(areas.length)
    setAreas((prev) => [...prev, emptyTapArea()])
  }

  const removeArea = (index: number) => {
    setSelectedAreaIndex((current) => {
      if (current === null || current === index) return null
      return current > index ? current - 1 : current
    })
    // 最後の1件を削除するときは空行1つにリセットして、数値入力の行が常に残るようにする。
    // これにより「唯一の(＝最初に作った)矩形」も削除できる。
    setAreas((prev) => (prev.length <= 1 ? [emptyTapArea()] : prev.filter((_, i) => i !== index)))
  }

  const overlayPoint = (event: PointerEvent<HTMLDivElement>): Point | null => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const imageSize = (): { width: number; height: number } => {
    const rect = overlayRef.current?.getBoundingClientRect()
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 }
  }

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageReady || imageLoadFailed) return
    const point = overlayPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedAreaIndex(null)
    setDragStart(point)
    setDragPreview(rectFromDrag(point, point, imageSize()))
  }

  const handleOverlayPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return
    const point = overlayPoint(event)
    if (!point) return
    setDragPreview(rectFromDrag(dragStart, point, imageSize()))
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const end = overlayPoint(event)
    setDragStart(null)
    setDragPreview(null)
    if (!end) return

    const dx = end.x - dragStart.x
    const dy = end.y - dragStart.y
    const movedEnough = Math.sqrt(dx * dx + dy * dy) >= 4
    if (!movedEnough) {
      setSelectedAreaIndex(null)
      return
    }

    const rect = rectFromDrag(dragStart, end, imageSize())
    if (rect.widthPercent <= 0 || rect.heightPercent <= 0) return

    const nextArea = areaFromRect(rect)
    // 空行があればそこに入れ、無ければ末尾に追加。選択インデックスは setAreas の
    // updater 外で確定させる（updater を純粋に保ち、選択が確実に更新されるようにする）。
    const emptyIndex = areas.findIndex(isBlankArea)
    if (emptyIndex >= 0) {
      setAreas((prev) => prev.map((area, index) => (index === emptyIndex ? nextArea : area)))
      setSelectedAreaIndex(emptyIndex)
    } else {
      setAreas((prev) => [...prev, nextArea])
      setSelectedAreaIndex(areas.length)
    }
  }

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setImageReady(true)
    setImageLoadFailed(false)
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      setAspectRatio(`${naturalWidth}:${naturalHeight}`)
    }
  }

  const handleImageError = () => {
    setImageReady(false)
    setImageLoadFailed(true)
    setDragStart(null)
    setDragPreview(null)
  }

  const handleGenerate = () => {
    if (!imageUrl.trim()) {
      setError('画像URLを入力してください')
      return
    }

    const linkedAreas = areas.filter((area) => area.uri.trim())
    for (const area of linkedAreas) {
      const percentValues = [area.topPercent, area.leftPercent, area.widthPercent, area.heightPercent]
      if (percentValues.some((value) => value.trim() === '' || Number.isNaN(Number(value)))) {
        setError('タップ領域の上/左/幅/高さは数値(%)で入力してください')
        return
      }
    }

    if (hasExistingContent) {
      const ok = window.confirm('既存のメッセージ内容(下のJSON)を、生成結果で上書きします。よろしいですか?')
      if (!ok) return
    }

    setError('')
    const bubble = tapImageMessage({
      imageUrl: imageUrl.trim(),
      altText: altText.trim() || undefined,
      aspectRatio: aspectRatio.trim() || undefined,
      areas: linkedAreas.map((area) => ({
        xPercent: Number(area.leftPercent),
        yPercent: Number(area.topPercent),
        widthPercent: Number(area.widthPercent),
        heightPercent: Number(area.heightPercent),
        uri: area.uri.trim(),
        label: area.label.trim() || undefined,
      })),
    })

    onGenerate(JSON.stringify(bubble, null, 2))
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-gray-600"
      >
        <span>{title}</span>
        <span className="shrink-0 text-green-700 underline">{isOpen ? '閉じる' : '開く'}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 mt-3">
          {description && (
            <p className="text-xs text-gray-500">{description}</p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">画像URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="https://example.com/banner.png"
              value={imageUrl}
              onChange={(e) => resetImageState(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">altText (通知欄・Flex非対応環境向け)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="キャンペーンのお知らせ"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">画像のアスペクト比 (幅:高さ)</label>
            <input
              type="text"
              className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="1:1"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              実際の画像の縦横比と合わせてください。ズレるとタップ領域が画像上の想定と違う位置になります。
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-2">画像プレビュー</label>
            <div className="relative overflow-hidden rounded-md border border-gray-300 bg-white">
              {imageUrl.trim() ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl.trim()}
                    alt={altText.trim() || 'タップ領域プレビュー'}
                    className="block w-full select-none"
                    draggable={false}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                  />
                  <div
                    ref={overlayRef}
                    className="absolute inset-0 touch-none cursor-crosshair"
                    onPointerDown={handleOverlayPointerDown}
                    onPointerMove={handleOverlayPointerMove}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                  >
                    {areas.map((area, index) => {
                      const rect = numericAreaRect(area)
                      if (!rect) return null
                      const isSelected = selectedAreaIndex === index
                      return (
                        <button
                          key={index}
                          type="button"
                          className={`absolute border-2 bg-green-400/20 focus:outline-none ${
                            isSelected ? 'border-blue-600 ring-2 ring-blue-200' : 'border-green-600'
                          }`}
                          style={{
                            top: `${rect.topPercent}%`,
                            left: `${rect.leftPercent}%`,
                            width: `${rect.widthPercent}%`,
                            height: `${rect.heightPercent}%`,
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            setSelectedAreaIndex(index)
                          }}
                          aria-label={`タップ領域 ${index + 1}`}
                        />
                      )
                    })}
                    {dragPreview && (
                      <div
                        className="absolute border-2 border-dashed border-blue-600 bg-blue-400/20"
                        style={{
                          top: `${dragPreview.topPercent}%`,
                          left: `${dragPreview.leftPercent}%`,
                          width: `${dragPreview.widthPercent}%`,
                          height: `${dragPreview.heightPercent}%`,
                        }}
                      />
                    )}
                  </div>
                  {!imageReady && !imageLoadFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 px-3 text-center text-xs text-gray-500">
                      画像を読み込んでいます
                    </div>
                  )}
                  {imageLoadFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-3 text-center text-xs text-red-600">
                      画像を読み込めませんでした。URLを確認してください。
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-40 items-center justify-center px-3 text-center text-xs text-gray-500">
                  画像URLを入力すると、ここでドラッグしてタップ領域を作成できます。
                </div>
              )}
            </div>
          </div>

          {selectedAreaIndex !== null && areas[selectedAreaIndex] && (
            <div className="grid gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 sm:grid-cols-[1fr_2fr_auto]">
              <div>
                <label className="block text-xs text-blue-700 mb-1">選択中のラベル</label>
                <input
                  type="text"
                  className="w-full border border-blue-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ラベル"
                  value={areas[selectedAreaIndex].label}
                  onChange={(e) => updateArea(selectedAreaIndex, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-blue-700 mb-1">選択中のリンク先URL</label>
                <input
                  type="url"
                  className="w-full border border-blue-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/"
                  value={areas[selectedAreaIndex].uri}
                  onChange={(e) => updateArea(selectedAreaIndex, { uri: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeArea(selectedAreaIndex)}
                className="self-end px-3 py-1.5 text-xs text-red-600"
              >
                削除
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-2">タップ領域</label>
            <div className="space-y-2">
              {areas.map((area, index) => (
                <div
                  key={index}
                  className={`grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-center border-b pb-2 ${
                    selectedAreaIndex === index ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200'
                  }`}
                  onFocus={() => setSelectedAreaIndex(index)}
                >
                  <input
                    type="text"
                    placeholder="ラベル"
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 col-span-2 sm:col-span-1"
                    value={area.label}
                    onChange={(e) => updateArea(index, { label: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="上から%"
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={area.topPercent}
                    onChange={(e) => updateArea(index, { topPercent: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="左から%"
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={area.leftPercent}
                    onChange={(e) => updateArea(index, { leftPercent: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="幅%"
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={area.widthPercent}
                    onChange={(e) => updateArea(index, { widthPercent: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="高さ%"
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={area.heightPercent}
                    onChange={(e) => updateArea(index, { heightPercent: e.target.value })}
                  />
                  <div className="flex gap-1 col-span-2 sm:col-span-1">
                    <input
                      type="url"
                      placeholder="リンク先URL"
                      className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={area.uri}
                      onChange={(e) => updateArea(index, { uri: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeArea(index)}
                      className="px-2 text-xs text-red-600"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={addArea} className="mt-2 text-xs text-green-700 underline">
              + タップ領域を追加
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleGenerate}
            className="px-3 py-1.5 min-h-[44px] text-xs font-medium text-white rounded-md"
            style={{ backgroundColor: '#06C755' }}
          >
            下のJSONに反映
          </button>
          <p className="text-xs text-gray-400">
            反映後もJSONは直接編集できます。空欄のURLの行は無視されます。
          </p>
        </div>
      )}
    </div>
  )
}
