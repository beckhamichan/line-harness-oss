import type { ApiBroadcastMessage } from '@/lib/api'

export const MAX_BROADCAST_MESSAGES = 5

export type BroadcastMessageDraft = ApiBroadcastMessage & {
  id: number
}

export function createBroadcastMessageDraft(id: number): BroadcastMessageDraft {
  return {
    id,
    type: 'text',
    content: '',
    altText: null,
  }
}

export function addBroadcastMessageDraft(
  messages: BroadcastMessageDraft[],
  nextId: number,
): BroadcastMessageDraft[] {
  if (messages.length >= MAX_BROADCAST_MESSAGES) return messages
  return [...messages, createBroadcastMessageDraft(nextId)]
}

export function removeBroadcastMessageDraft(
  messages: BroadcastMessageDraft[],
  index: number,
): BroadcastMessageDraft[] {
  if (messages.length <= 1 || index < 0 || index >= messages.length) return messages
  return messages.filter((_, messageIndex) => messageIndex !== index)
}

export function moveBroadcastMessageDraft(
  messages: BroadcastMessageDraft[],
  index: number,
  direction: -1 | 1,
): BroadcastMessageDraft[] {
  const destination = index + direction
  if (index < 0 || index >= messages.length || destination < 0 || destination >= messages.length) {
    return messages
  }
  const next = [...messages]
  ;[next[index], next[destination]] = [next[destination], next[index]]
  return next
}

export function validateBroadcastMessageDrafts(messages: BroadcastMessageDraft[]): string | null {
  if (messages.length < 1 || messages.length > MAX_BROADCAST_MESSAGES) {
    return `メッセージは1〜${MAX_BROADCAST_MESSAGES}件にしてください`
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message.content.trim()) return `メッセージ${index + 1}の内容を入力してください`
    if (message.type === 'flex') {
      try {
        JSON.parse(message.content)
      } catch {
        return `メッセージ${index + 1}のFlex JSONが無効です`
      }
    }
  }

  return null
}

export function toApiBroadcastMessages(messages: BroadcastMessageDraft[]): ApiBroadcastMessage[] {
  return messages.map(({ type, content, altText }) => ({
    type,
    content,
    altText: altText?.trim() || null,
  }))
}
