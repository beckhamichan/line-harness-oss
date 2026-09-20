import { describe, expect, it } from 'vitest'
import {
  MAX_BROADCAST_MESSAGES,
  addBroadcastMessageDraft,
  createBroadcastMessageDraft,
  moveBroadcastMessageDraft,
  removeBroadcastMessageDraft,
  toApiBroadcastMessages,
  validateBroadcastMessageDrafts,
} from './broadcast-message-utils'

describe('broadcast message drafts', () => {
  it('adds messages up to five and keeps the original array at the limit', () => {
    let messages = [createBroadcastMessageDraft(1)]
    for (let id = 2; id <= MAX_BROADCAST_MESSAGES; id += 1) {
      messages = addBroadcastMessageDraft(messages, id)
    }

    expect(messages.map((message) => message.id)).toEqual([1, 2, 3, 4, 5])
    expect(addBroadcastMessageDraft(messages, 6)).toBe(messages)
  })

  it('does not remove the final message', () => {
    const messages = [createBroadcastMessageDraft(1)]
    expect(removeBroadcastMessageDraft(messages, 0)).toBe(messages)
  })

  it('removes and reorders messages without changing their contents', () => {
    const first = { ...createBroadcastMessageDraft(1), content: 'first' }
    const second = { ...createBroadcastMessageDraft(2), content: 'second' }
    const third = { ...createBroadcastMessageDraft(3), content: 'third' }

    expect(moveBroadcastMessageDraft([first, second, third], 2, -1).map((message) => message.id))
      .toEqual([1, 3, 2])
    expect(removeBroadcastMessageDraft([first, second, third], 1).map((message) => message.id))
      .toEqual([1, 3])
  })

  it('validates every message and reports its one-based position', () => {
    expect(validateBroadcastMessageDrafts([createBroadcastMessageDraft(1)]))
      .toBe('メッセージ1の内容を入力してください')

    expect(validateBroadcastMessageDrafts([
      { ...createBroadcastMessageDraft(1), type: 'text', content: 'ok' },
      { ...createBroadcastMessageDraft(2), type: 'flex', content: '{invalid' },
    ])).toBe('メッセージ2のFlex JSONが無効です')
  })

  it('serializes messages in display order and normalizes blank alt text', () => {
    const messages = [
      { ...createBroadcastMessageDraft(2), type: 'image' as const, content: '{"url":"two"}', altText: '  ' },
      { ...createBroadcastMessageDraft(1), type: 'text' as const, content: 'one', altText: 'ignored' },
    ]

    expect(toApiBroadcastMessages(messages)).toEqual([
      { type: 'image', content: '{"url":"two"}', altText: null },
      { type: 'text', content: 'one', altText: 'ignored' },
    ])
  })
})
