import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, describe, expect, test, vi } from 'vitest'

// Run the actual effect bodies with a document EventTarget and fake timers.
// Avoid a new DOM/test-renderer dependency for these two timer lifecycles.
function mount(kind: 'sidebar' | 'notifications', visible: boolean) {
  const file = kind === 'sidebar' ? new URL('./sidebar.tsx', import.meta.url) : new URL('../../app/notifications/page.tsx', import.meta.url)
  const source = readFileSync(file, 'utf8')
  const marker = kind === 'sidebar' ? '    let cancelled = false' : '    let id: ReturnType<typeof setInterval>'
  const start = source.indexOf(marker)
  const end = source.indexOf(kind === 'sidebar' ? '  }, [])' : '  }, [loadAll])', start)
  expect(start).toBeGreaterThan(0)
  const body = source.slice(start, end).replace("import('@/lib/api')", 'importApi()')
  const js = ts.transpileModule(`function effect() {\n${body}\n}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const document = Object.assign(new EventTarget(), {visibilityState: visible ? 'visible' : 'hidden'})
  const fetch = vi.fn(async () => ({success:true,data:{total:3}}))
  const setCount = vi.fn()
  const importApi = async () => ({api:{inbox:{unanswered:{count:fetch}}}})
  const cleanup = new Function('document','importApi','setUnansweredCount','loadAll','POLL_INTERVAL_MS','requestSeqRef', `${js}; return effect()`)(document,importApi,setCount,fetch,30000,{current:0}) as () => void
  return {fetch, setCount, cleanup, visibility(visible: boolean) {
    document.visibilityState = visible ? 'visible' : 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
  }}
}
afterEach(() => { vi.useRealTimers() })
for (const kind of ['sidebar', 'notifications'] as const) {
  describe(`${kind} visible-tab polling`, () => {
    const interval = kind === 'sidebar' ? 300000 : 30000
    test('hidden initial mount does not fetch; showing refreshes immediately', async () => {
      vi.useFakeTimers(); const app=mount(kind,false)
      await vi.advanceTimersByTimeAsync(interval*3)
      expect(app.fetch).toHaveBeenCalledTimes(0)
      expect(vi.getTimerCount()).toBe(0)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      app.cleanup()
    })
    test('hiding stops polling; resuming restores a single timer; cleanup removes listener', async () => {
      vi.useFakeTimers(); const app=mount(kind,true)
      await vi.advanceTimersByTimeAsync(interval)
      expect(app.fetch).toHaveBeenCalledTimes(2)
      app.visibility(false); await vi.advanceTimersByTimeAsync(interval*3)
      expect(app.fetch).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(3)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(1)
      app.cleanup(); app.visibility(false); app.visibility(true)
      await vi.advanceTimersByTimeAsync(interval*2)
      expect(app.fetch).toHaveBeenCalledTimes(4)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
}
