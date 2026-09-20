import type { HttpClient } from '../http.js'
import type { ApiResponse, Broadcast, CreateBroadcastInput, UpdateBroadcastInput, SegmentCondition } from '../types.js'

const MAX_BROADCAST_MESSAGES = 5

type BroadcastMessageFields = {
  messages?: unknown[]
  messageType?: unknown
  messageContent?: unknown
  altText?: unknown
}

function validateMessageFields(input: BroadcastMessageFields): void {
  if (input.messages === undefined) return

  if (
    input.messageType !== undefined ||
    input.messageContent !== undefined ||
    input.altText !== undefined
  ) {
    throw new Error('messages cannot be combined with messageType, messageContent, or altText')
  }

  if (input.messages.length < 1 || input.messages.length > MAX_BROADCAST_MESSAGES) {
    throw new RangeError(`messages must contain between 1 and ${MAX_BROADCAST_MESSAGES} items`)
  }
}

export class BroadcastsResource {
  constructor(
    private readonly http: HttpClient,
    private readonly defaultAccountId?: string,
  ) {}

  async list(params?: { accountId?: string }): Promise<Broadcast[]> {
    const accountId = params?.accountId ?? this.defaultAccountId
    const query = accountId ? `?lineAccountId=${accountId}` : ''
    const res = await this.http.get<ApiResponse<Broadcast[]>>(`/api/broadcasts${query}`)
    return res.data
  }

  async get(id: string): Promise<Broadcast> {
    const res = await this.http.get<ApiResponse<Broadcast>>(`/api/broadcasts/${id}`)
    return res.data
  }

  async create(input: CreateBroadcastInput & { lineAccountId?: string }): Promise<Broadcast> {
    validateMessageFields(input)
    const body = { ...input }
    if (!body.lineAccountId && this.defaultAccountId) {
      body.lineAccountId = this.defaultAccountId
    }
    const res = await this.http.post<ApiResponse<Broadcast>>('/api/broadcasts', body)
    return res.data
  }

  async update(id: string, input: UpdateBroadcastInput): Promise<Broadcast> {
    validateMessageFields(input)
    const res = await this.http.put<ApiResponse<Broadcast>>(`/api/broadcasts/${id}`, input)
    return res.data
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/broadcasts/${id}`)
  }

  async send(id: string): Promise<Broadcast> {
    const res = await this.http.post<ApiResponse<Broadcast>>(`/api/broadcasts/${id}/send`)
    return res.data
  }

  async sendToSegment(id: string, conditions: SegmentCondition): Promise<Broadcast> {
    const res = await this.http.post<ApiResponse<Broadcast>>(
      `/api/broadcasts/${id}/send-segment`,
      { conditions },
    )
    return res.data
  }
}
