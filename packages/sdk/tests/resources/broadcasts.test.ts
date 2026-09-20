import { describe, it, expect, vi } from 'vitest'
import { BroadcastsResource } from '../../src/resources/broadcasts.js'
import type { HttpClient } from '../../src/http.js'

function mockHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as HttpClient
}

describe('BroadcastsResource', () => {
  it('list() calls GET /api/broadcasts and returns Broadcast[]', async () => {
    const broadcasts = [
      {
        id: 'bc-1',
        title: 'Spring Sale',
        messageType: 'text' as const,
        messageContent: 'Enjoy 50% off',
        targetType: 'all' as const,
        targetTagId: null,
        status: 'sent' as const,
        scheduledAt: null,
        sentAt: '2026-03-21T10:00:00Z',
        totalCount: 100,
        successCount: 95,
        createdAt: '2026-03-20T10:00:00Z',
      },
    ]
    const http = mockHttp({ get: vi.fn().mockResolvedValue({ success: true, data: broadcasts }) })
    const resource = new BroadcastsResource(http)
    const result = await resource.list()
    expect(http.get).toHaveBeenCalledWith('/api/broadcasts')
    expect(result).toEqual(broadcasts)
  })

  it('get(id) calls GET /api/broadcasts/:id and returns Broadcast', async () => {
    const broadcast = {
      id: 'bc-1',
      title: 'Spring Sale',
      messageType: 'text' as const,
      messageContent: 'Enjoy 50% off',
      targetType: 'all' as const,
      targetTagId: null,
      status: 'sent' as const,
      scheduledAt: null,
      sentAt: '2026-03-21T10:00:00Z',
      totalCount: 100,
      successCount: 95,
      createdAt: '2026-03-20T10:00:00Z',
    }
    const http = mockHttp({ get: vi.fn().mockResolvedValue({ success: true, data: broadcast }) })
    const resource = new BroadcastsResource(http)
    const result = await resource.get('bc-1')
    expect(http.get).toHaveBeenCalledWith('/api/broadcasts/bc-1')
    expect(result).toEqual(broadcast)
  })

  it('create(input) calls POST /api/broadcasts with input', async () => {
    const broadcast = {
      id: 'bc-1',
      title: 'Spring Sale',
      messageType: 'text' as const,
      messageContent: 'Enjoy 50% off',
      targetType: 'all' as const,
      targetTagId: null,
      status: 'draft' as const,
      scheduledAt: null,
      sentAt: null,
      totalCount: 0,
      successCount: 0,
      createdAt: '2026-03-21T10:00:00Z',
    }
    const input = {
      title: 'Spring Sale',
      messageType: 'text' as const,
      messageContent: 'Enjoy 50% off',
      targetType: 'all' as const,
    }
    const http = mockHttp({ post: vi.fn().mockResolvedValue({ success: true, data: broadcast }) })
    const resource = new BroadcastsResource(http)
    const result = await resource.create(input)
    expect(http.post).toHaveBeenCalledWith('/api/broadcasts', input)
    expect(result).toEqual(broadcast)
  })

  it('create(input) sends one message in the new format', async () => {
    const input = {
      title: 'Single message',
      messages: [{ type: 'text' as const, content: 'Hello' }],
      targetType: 'all' as const,
    }
    const http = mockHttp({ post: vi.fn().mockResolvedValue({ success: true, data: {} }) })
    const resource = new BroadcastsResource(http)

    await resource.create(input)

    expect(http.post).toHaveBeenCalledWith('/api/broadcasts', input)
  })

  it('create(input) preserves the order of five messages', async () => {
    const messages = [
      { type: 'text' as const, content: 'one' },
      { type: 'image' as const, content: '{"originalContentUrl":"https://example.com/2.jpg"}' },
      { type: 'flex' as const, content: '{"type":"bubble"}', altText: 'three' },
      { type: 'text' as const, content: 'four' },
      { type: 'text' as const, content: 'five' },
    ]
    const input = { title: 'Five messages', messages, targetType: 'all' as const }
    const http = mockHttp({ post: vi.fn().mockResolvedValue({ success: true, data: {} }) })
    const resource = new BroadcastsResource(http)

    await resource.create(input)

    expect(http.post).toHaveBeenCalledWith('/api/broadcasts', input)
    expect((http.post as ReturnType<typeof vi.fn>).mock.calls[0][1].messages).toEqual(messages)
  })

  it.each([
    ['zero', []],
    ['six', Array.from({ length: 6 }, (_, index) => ({ type: 'text' as const, content: `message-${index}` }))],
  ])('rejects %s messages before making a request', async (_label, messages) => {
    const http = mockHttp({ post: vi.fn() })
    const resource = new BroadcastsResource(http)

    await expect(resource.create({
      title: 'Invalid messages',
      messages,
      targetType: 'all',
    })).rejects.toThrow('messages must contain between 1 and 5 items')
    expect(http.post).not.toHaveBeenCalled()
  })

  it('rejects new and legacy message fields used together', async () => {
    const http = mockHttp({ post: vi.fn() })
    const resource = new BroadcastsResource(http)
    const mixedInput = {
      title: 'Ambiguous',
      messages: [{ type: 'text' as const, content: 'new' }],
      messageType: 'text' as const,
      messageContent: 'legacy',
      targetType: 'all' as const,
    }

    await expect(resource.create(mixedInput as never)).rejects.toThrow(
      'messages cannot be combined with messageType, messageContent, or altText',
    )
    expect(http.post).not.toHaveBeenCalled()
  })

  it('update(id, input) calls PUT /api/broadcasts/:id with input', async () => {
    const updatedBroadcast = {
      id: 'bc-1',
      title: 'Spring Sale - Updated',
      messageType: 'text' as const,
      messageContent: 'Enjoy 60% off',
      targetType: 'all' as const,
      targetTagId: null,
      status: 'draft' as const,
      scheduledAt: null,
      sentAt: null,
      totalCount: 0,
      successCount: 0,
      createdAt: '2026-03-21T10:00:00Z',
    }
    const input = {
      title: 'Spring Sale - Updated',
      messageContent: 'Enjoy 60% off',
    }
    const http = mockHttp({ put: vi.fn().mockResolvedValue({ success: true, data: updatedBroadcast }) })
    const resource = new BroadcastsResource(http)
    const result = await resource.update('bc-1', input)
    expect(http.put).toHaveBeenCalledWith('/api/broadcasts/bc-1', input)
    expect(result).toEqual(updatedBroadcast)
  })

  it('update(id, input) sends the complete messages array in order', async () => {
    const messages = [
      { type: 'text' as const, content: 'updated first' },
      { type: 'image' as const, content: '{"originalContentUrl":"https://example.com/updated.jpg"}' },
    ]
    const input = { messages }
    const http = mockHttp({ put: vi.fn().mockResolvedValue({ success: true, data: {} }) })
    const resource = new BroadcastsResource(http)

    await resource.update('bc-1', input)

    expect(http.put).toHaveBeenCalledWith('/api/broadcasts/bc-1', input)
    expect((http.put as ReturnType<typeof vi.fn>).mock.calls[0][1].messages).toEqual(messages)
  })

  it('rejects new and legacy message fields used together for update', async () => {
    const http = mockHttp({ put: vi.fn() })
    const resource = new BroadcastsResource(http)
    const mixedInput = {
      messages: [{ type: 'text' as const, content: 'new' }],
      messageContent: 'legacy',
    }

    await expect(resource.update('bc-1', mixedInput as never)).rejects.toThrow(
      'messages cannot be combined with messageType, messageContent, or altText',
    )
    expect(http.put).not.toHaveBeenCalled()
  })

  it('delete(id) calls DELETE /api/broadcasts/:id', async () => {
    const http = mockHttp({ delete: vi.fn().mockResolvedValue({ success: true, data: null }) })
    const resource = new BroadcastsResource(http)
    await resource.delete('bc-1')
    expect(http.delete).toHaveBeenCalledWith('/api/broadcasts/bc-1')
  })

  it('send(id) calls POST /api/broadcasts/:id/send and returns Broadcast', async () => {
    const broadcast = {
      id: 'bc-1',
      title: 'Spring Sale',
      messageType: 'text' as const,
      messageContent: 'Enjoy 50% off',
      targetType: 'all' as const,
      targetTagId: null,
      status: 'sending' as const,
      scheduledAt: null,
      sentAt: null,
      totalCount: 100,
      successCount: 0,
      createdAt: '2026-03-20T10:00:00Z',
    }
    const http = mockHttp({ post: vi.fn().mockResolvedValue({ success: true, data: broadcast }) })
    const resource = new BroadcastsResource(http)
    const result = await resource.send('bc-1')
    expect(http.post).toHaveBeenCalledWith('/api/broadcasts/bc-1/send')
    expect(result).toEqual(broadcast)
  })
})
