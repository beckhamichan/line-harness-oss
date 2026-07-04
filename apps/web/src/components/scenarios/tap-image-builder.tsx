'use client'

import { useState } from 'react'
import { tapImageMessage } from '@line-crm/line-sdk'

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
}

function emptyTapArea(): TapAreaInput {
  return { label: '', topPercent: '', leftPercent: '', widthPercent: '', heightPercent: '', uri: '' }
}

export default function TapImageBuilder({ onGenerate, hasExistingContent }: TapImageBuilderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [altText, setAltText] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [areas, setAreas] = useState<TapAreaInput[]>([emptyTapArea()])
  const [error, setError] = useState('')

  const updateArea = (index: number, patch: Partial<TapAreaInput>) => {
    setAreas((prev) => prev.map((area, i) => (i === index ? { ...area, ...patch } : area)))
  }

  const addArea = () => setAreas((prev) => [...prev, emptyTapArea()])

  const removeArea = (index: number) => {
    setAreas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
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
        <span>タップ画像ビルダー(任意) - 1枚の画像に複数のタップ領域を設定</span>
        <span className="shrink-0 text-green-700 underline">{isOpen ? '閉じる' : '開く'}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">画像URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="https://example.com/banner.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
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
            <label className="block text-xs text-gray-500 mb-2">タップ領域</label>
            <div className="space-y-2">
              {areas.map((area, index) => (
                <div key={index} className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-center border-b border-gray-200 pb-2">
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
                      disabled={areas.length <= 1}
                      className="px-2 text-xs text-red-600 disabled:opacity-30"
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
