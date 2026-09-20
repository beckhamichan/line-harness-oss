'use client'

import type { ApiBroadcast, EventListItem } from '@/lib/api'
import TapImageBuilder from '@/components/scenarios/tap-image-builder'
import ImageUploader from '@/components/shared/image-uploader'
import BroadcastMessagePreview from './broadcast-message-preview'
import {
  MAX_BROADCAST_MESSAGES,
  addBroadcastMessageDraft,
  moveBroadcastMessageDraft,
  removeBroadcastMessageDraft,
  type BroadcastMessageDraft,
} from './broadcast-message-utils'

const messageTypeLabels: Record<ApiBroadcast['messageType'], string> = {
  text: 'テキスト',
  image: '画像',
  flex: 'Flexメッセージ',
}

interface BroadcastMessageEditorProps {
  messages: BroadcastMessageDraft[]
  linkableEvents: EventListItem[]
  nextMessageId: number
  onNextMessageIdChange: (nextId: number) => void
  onChange: (messages: BroadcastMessageDraft[]) => void
}

export default function BroadcastMessageEditor({
  messages,
  linkableEvents,
  nextMessageId,
  onNextMessageIdChange,
  onChange,
}: BroadcastMessageEditorProps) {
  const updateMessage = (index: number, updates: Partial<BroadcastMessageDraft>) => {
    onChange(messages.map((message, messageIndex) => (
      messageIndex === index ? { ...message, ...updates } : message
    )))
  }

  const addMessage = () => {
    const next = addBroadcastMessageDraft(messages, nextMessageId)
    if (next !== messages) {
      onChange(next)
      onNextMessageIdChange(nextMessageId + 1)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-600">メッセージ</p>
          <p className="mt-0.5 text-xs text-gray-400">上から順に、1回の配信でまとめて送信します</p>
        </div>
        <span className="text-xs text-gray-500">{messages.length} / {MAX_BROADCAST_MESSAGES}件</span>
      </div>

      <div className="space-y-4">
        {messages.map((message, index) => (
          <div key={message.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700">メッセージ {index + 1}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`メッセージ${index + 1}を上へ移動`}
                  title="上へ移動"
                  disabled={index === 0}
                  onClick={() => onChange(moveBroadcastMessageDraft(messages, index, -1))}
                  className="min-h-[36px] min-w-[36px] rounded-md border border-gray-300 bg-white text-sm text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`メッセージ${index + 1}を下へ移動`}
                  title="下へ移動"
                  disabled={index === messages.length - 1}
                  onClick={() => onChange(moveBroadcastMessageDraft(messages, index, 1))}
                  className="min-h-[36px] min-w-[36px] rounded-md border border-gray-300 bg-white text-sm text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={messages.length === 1}
                  onClick={() => onChange(removeBroadcastMessageDraft(messages, index))}
                  className="min-h-[36px] rounded-md border border-red-200 bg-white px-3 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  削除
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {(Object.keys(messageTypeLabels) as ApiBroadcast['messageType'][]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateMessage(index, { type, content: '', altText: null })}
                  className={`min-h-[40px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    message.type === type
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {messageTypeLabels[type]}
                </button>
              ))}
            </div>

            {message.type === 'image' && (
              <div className="mb-2">
                <ImageUploader
                  mode="line-image"
                  value={(() => {
                    try {
                      const parsed = JSON.parse(message.content) as { originalContentUrl?: string; previewImageUrl?: string }
                      if (parsed.originalContentUrl) {
                        return {
                          mode: 'line-image' as const,
                          originalContentUrl: parsed.originalContentUrl,
                          previewImageUrl: parsed.previewImageUrl ?? parsed.originalContentUrl,
                        }
                      }
                    } catch { /* ignore malformed manual JSON */ }
                    return null
                  })()}
                  onChange={(value) => {
                    updateMessage(index, {
                      content: value?.mode === 'line-image'
                        ? JSON.stringify({
                            originalContentUrl: value.originalContentUrl,
                            previewImageUrl: value.previewImageUrl,
                          })
                        : '',
                    })
                  }}
                  label="送信する画像"
                />
              </div>
            )}

            {linkableEvents.length > 0 && message.type === 'text' && (
              <div className="mb-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">リンクするイベント（任意）</label>
                <select
                  value=""
                  onChange={(event) => {
                    const eventId = event.target.value
                    if (!eventId) return
                    const url = `https://liff.line.me/{{liff_id}}/?page=event&id=${eventId}`
                    updateMessage(index, { content: message.content ? `${message.content}\n${url}` : url })
                    event.target.value = ''
                  }}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— 選択しない —</option>
                  {linkableEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name} ({event.target_type === 'multi-account-dedup' ? 'multi' : 'single'})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  選ぶとこのメッセージ末尾にテンプレURLを挿入します。
                </p>
              </div>
            )}

            {message.type === 'flex' && (
              <div className="mb-2">
                <TapImageBuilder
                  title="画像リンクメッセージを作成"
                  description="画像URLを入れて、画像の上をドラッグするとタップ領域を作成できます。"
                  defaultOpen={false}
                  hasExistingContent={message.content.trim() !== ''}
                  onGenerate={(json) => updateMessage(index, { content: json })}
                />
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-gray-600">
              {message.type === 'flex' ? 'Flex JSON（自動生成・直接編集も可）' : 'メッセージ内容'}
              <span className="text-red-500"> *</span>
              {message.type === 'image' && <span className="ml-1 text-gray-400">（JSON形式）</span>}
            </label>
            <textarea
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={message.type === 'flex' ? 8 : message.type === 'image' ? 3 : 4}
              placeholder={
                message.type === 'text'
                  ? '配信するメッセージを入力...'
                  : message.type === 'image'
                    ? '{"originalContentUrl":"...","previewImageUrl":"..."}'
                    : '{"type":"bubble","body":{...}}'
              }
              value={message.content}
              onChange={(event) => updateMessage(index, { content: event.target.value })}
              style={{ fontFamily: message.type !== 'text' ? 'monospace' : 'inherit' }}
            />

            {message.type === 'flex' && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">代替テキスト（任意）</label>
                <input
                  type="text"
                  maxLength={400}
                  value={message.altText ?? ''}
                  onChange={(event) => updateMessage(index, { altText: event.target.value })}
                  placeholder="通知やFlex非対応環境に表示する短い説明"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}

            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-gray-500">プレビュー</p>
              <BroadcastMessagePreview message={message} />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={messages.length >= MAX_BROADCAST_MESSAGES}
        onClick={addMessage}
        className="mt-3 min-h-[44px] w-full rounded-lg border border-dashed border-green-400 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
      >
        {messages.length >= MAX_BROADCAST_MESSAGES ? '最大5件まで追加できます' : '+ メッセージを追加'}
      </button>
    </div>
  )
}
