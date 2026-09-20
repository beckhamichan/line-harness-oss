'use client'

import { useEffect, useState } from 'react'
import type { Tag } from '@line-crm/shared'
import { api, eventsApi, getApiErrorReason, type EventListItem } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import BroadcastMessageEditor from './broadcast-message-editor'
import {
  createBroadcastMessageDraft,
  toApiBroadcastMessages,
  validateBroadcastMessageDrafts,
  type BroadcastMessageDraft,
} from './broadcast-message-utils'
import MultiAccountDedupSection from './multi-account-dedup-section'

interface BroadcastFormProps {
  tags: Tag[]
  onSuccess: () => void
  onCancel: () => void
}

interface FormState {
  title: string
  messages: BroadcastMessageDraft[]
  targetType: 'all' | 'tag' | 'segment' | 'multi-account-dedup'
  targetTagId: string
  targetTagIds: string[]
  scheduledAt: string
  sendNow: boolean
  accountIds: string[]
  dedupPriority: string[]
}

export default function BroadcastForm({ tags, onSuccess, onCancel }: BroadcastFormProps) {
  const { selectedAccountId } = useAccount()
  const [linkableEvents, setLinkableEvents] = useState<EventListItem[]>([])
  const [nextMessageId, setNextMessageId] = useState(2)

  useEffect(() => {
    if (!selectedAccountId) return
    let cancelled = false
    eventsApi.listEvents(selectedAccountId)
      .then((result) => {
        if (!cancelled) setLinkableEvents(result.items.filter((event) => event.is_published === 1))
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [selectedAccountId])

  const [form, setForm] = useState<FormState>({
    title: '',
    messages: [createBroadcastMessageDraft(1)],
    targetType: 'all',
    targetTagId: '',
    targetTagIds: [],
    scheduledAt: '',
    sendNow: true,
    accountIds: [],
    dedupPriority: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.title.trim()) { setError('配信タイトルを入力してください'); return }
    const messageError = validateBroadcastMessageDrafts(form.messages)
    if (messageError) { setError(messageError); return }
    if (!form.sendNow && !form.scheduledAt) {
      setError('予約配信の場合は配信日時を指定してください')
      return
    }
    if (form.targetType === 'tag' && form.targetTagIds.length === 0) {
      setError('タグを1つ以上選択してください')
      return
    }
    if (form.targetType === 'multi-account-dedup' && form.accountIds.length === 0) {
      setError('複数アカ重複除外: 配信先アカウントを 1 つ以上選択してください')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await api.broadcasts.create({
        title: form.title,
        messages: toApiBroadcastMessages(form.messages),
        targetType: form.targetType,
        targetTagId: form.targetType === 'multi-account-dedup' ? form.targetTagId || null : null,
        targetTagIds: form.targetType === 'tag' ? form.targetTagIds : undefined,
        status: 'draft',
        lineAccountId: form.targetType === 'multi-account-dedup' ? null : (selectedAccountId || null),
        accountIds: form.targetType === 'multi-account-dedup' ? form.accountIds : undefined,
        dedupPriority: form.targetType === 'multi-account-dedup' ? form.dedupPriority : undefined,
        // datetime-local returns YYYY-MM-DDTHH:mm in JST wall-clock time.
        scheduledAt: form.sendNow || !form.scheduledAt
          ? null
          : form.scheduledAt + ':00.000+09:00',
      })
      if (result.success) {
        onSuccess()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(getApiErrorReason(err) ?? '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-sm font-semibold text-gray-800">新規配信を作成</h2>

      <div className="max-w-2xl space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            配信タイトル <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="例: 3月のキャンペーン告知"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>

        <BroadcastMessageEditor
          messages={form.messages}
          linkableEvents={linkableEvents}
          nextMessageId={nextMessageId}
          onNextMessageIdChange={setNextMessageId}
          onChange={(messages) => setForm((current) => ({ ...current, messages }))}
        />

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">配信対象</label>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, targetType: 'all', targetTagId: '', targetTagIds: [] })}
              className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.targetType === 'all'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              全員
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, targetType: 'tag' })}
              className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.targetType === 'tag'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              タグで絞り込み
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, targetType: 'multi-account-dedup', targetTagId: '', targetTagIds: [] })}
              className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.targetType === 'multi-account-dedup'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              複数アカ重複除外
            </button>
          </div>

          {form.targetType === 'tag' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>いずれかのタグに該当する友だちへ配信します</span>
                <span>{form.targetTagIds.length} / 20 選択</span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-300 bg-white p-2">
                {tags.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-gray-400">選択できるタグがありません</p>
                ) : tags.map((tag) => {
                  const checked = form.targetTagIds.includes(tag.id)
                  const disabled = !checked && form.targetTagIds.length >= 20
                  return (
                    <label key={tag.id} className={`flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm ${disabled ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => setForm((current) => ({
                          ...current,
                          targetTagIds: checked
                            ? current.targetTagIds.filter((id) => id !== tag.id)
                            : [...current.targetTagIds, tag.id],
                        }))}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span>{tag.name}</span>
                    </label>
                  )
                })}
              </div>
              {!selectedAccountId && (
                <p className="text-xs text-amber-700">
                  アカウントが未選択のため、選択タグに該当する全アカウントの友だちが対象になります。
                </p>
              )}
            </div>
          )}

          {form.targetType === 'multi-account-dedup' && (
            <MultiAccountDedupSection
              accountIds={form.accountIds}
              dedupPriority={form.dedupPriority}
              targetTagId={form.targetTagId || null}
              tags={tags}
              onAccountIdsChange={(accountIds) => setForm({ ...form, accountIds })}
              onDedupPriorityChange={(dedupPriority) => setForm({ ...form, dedupPriority })}
              onTargetTagIdChange={(targetTagId) => setForm({ ...form, targetTagId: targetTagId ?? '' })}
            />
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">配信タイミング</label>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, sendNow: true, scheduledAt: '' })}
              className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.sendNow
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              下書きとして保存
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, sendNow: false })}
              className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                !form.sendNow
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              予約配信
            </button>
          </div>
          {!form.sendNow && (
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={form.scheduledAt}
              onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
            />
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {saving ? '作成中...' : '作成'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="min-h-[44px] rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
