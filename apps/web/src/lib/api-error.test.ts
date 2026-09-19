import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * fetchApi が、サーバーの返した理由を利用者に届けることを確かめる（ISSUE-0080）。
 *
 * 背景: 配信禁止時間帯の予約は 400 + 日本語の理由で拒否されるが、以前の fetchApi は
 * 理由を捨てて `API error: 400` だけを投げていた。そのため画面には固定文言しか出ず、
 * 「なぜ失敗したか」が利用者に伝わらなかった。
 */

async function loadApi() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://example-worker.workers.dev')
  return import('./api')
}

function stubResponse(status: number, body?: unknown, rawText?: string) {
  const ok = status >= 200 && status < 300
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => {
        if (rawText !== undefined) throw new SyntaxError('Unexpected token')
        return body
      },
    })),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('fetchApi のエラー理由', () => {
  it('サーバーが理由(error)を返したら、その文言を Error.message に載せる', async () => {
    stubResponse(400, {
      success: false,
      error: '配信禁止時間帯（JST 23:00〜翌7:00）は予約できません。7:00以降の日時を指定してください。',
    })
    const { fetchApi } = await loadApi()

    await expect(fetchApi('/api/broadcasts', { method: 'POST' })).rejects.toThrow(
      '配信禁止時間帯（JST 23:00〜翌7:00）は予約できません。7:00以降の日時を指定してください。',
    )
  })

  it('本文が JSON でなくても従来どおり API error: <status> を投げる（互換）', async () => {
    stubResponse(502, undefined, '<html>Bad Gateway</html>')
    const { fetchApi } = await loadApi()

    await expect(fetchApi('/api/x')).rejects.toThrow('API error: 502')
  })

  it('error が無い・空・文字列でない場合も従来どおり', async () => {
    const { fetchApi } = await loadApi()

    stubResponse(500, { success: false })
    await expect(fetchApi('/api/x')).rejects.toThrow('API error: 500')

    stubResponse(500, { success: false, error: '' })
    await expect(fetchApi('/api/x')).rejects.toThrow('API error: 500')

    stubResponse(500, { success: false, error: { code: 1 } })
    await expect(fetchApi('/api/x')).rejects.toThrow('API error: 500')
  })

  it('成功応答は今までどおり本文を返す', async () => {
    stubResponse(200, { success: true, data: { id: 'b1' } })
    const { fetchApi } = await loadApi()

    await expect(fetchApi('/api/x')).resolves.toEqual({ success: true, data: { id: 'b1' } })
  })
})

describe('getApiErrorReason', () => {
  it('サーバーの理由はそのまま返す', async () => {
    const { getApiErrorReason } = await loadApi()
    expect(getApiErrorReason(new Error('7:00以降に送信してください。'))).toBe('7:00以降に送信してください。')
  })

  it('素のステータス文言は隠す（利用者に意味がないため）', async () => {
    const { getApiErrorReason } = await loadApi()
    expect(getApiErrorReason(new Error('API error: 400'))).toBeUndefined()
  })

  it('Error でない値・空メッセージは undefined', async () => {
    const { getApiErrorReason } = await loadApi()
    expect(getApiErrorReason('boom')).toBeUndefined()
    expect(getApiErrorReason(null)).toBeUndefined()
    expect(getApiErrorReason(new Error(''))).toBeUndefined()
  })
})
