import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, describe, expect, test, vi } from 'vitest'

// Run the actual effect bodies with a document EventTarget and fake timers.
// Avoid a new DOM/test-renderer dependency for these two timer lifecycles.
function mount(kind: 'sidebar' | 'notifications', visible: boolean, lastFetchStartedAtRef: { current: number | null } = { current: null }) {
  const file = kind === 'sidebar' ? new URL('./sidebar.tsx', import.meta.url) : new URL('../../app/notifications/page.tsx', import.meta.url)
  const source = readFileSync(file, 'utf8')
  const marker = kind === 'sidebar' ? '    let cancelled = false' : '    let id: ReturnType<typeof setInterval>'
  const start = source.indexOf(marker)
  const end = source.indexOf(kind === 'sidebar' ? '  }, [])' : '  }, [loadAll])', start)
  expect(start).toBeGreaterThan(0)
  let body = source.slice(start, end).replace("import('@/lib/api')", 'importApi()')
  if (kind === 'notifications') {
    const loadStart = source.indexOf('  const loadAll = useCallback(async () => {')
    const loadEnd = source.indexOf('  }, [])', loadStart)
    body = source.slice(loadStart, loadEnd).replace('const loadAll = useCallback(async () => {', 'const loadAll = async () => {') + '  };\n' + body
  }
  const js = ts.transpileModule(`function effect() {\n${body}\n}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const pollInterval = kind === 'notifications'
    ? new Function(`return ${source.match(/const POLL_INTERVAL_MS = (.+)/)![1]}`)() as number
    : 5 * 60_000
  const document = Object.assign(new EventTarget(), {visibilityState: visible ? 'visible' : 'hidden'})
  const fetch = vi.fn(async () => ({success:true,data:{total:3,rows:[]}}))
  const setCount = vi.fn()
  const importApi = async () => ({api:{inbox:{unanswered:{count:fetch}}}})
  const cleanup = new Function('document','importApi','setUnansweredCount','api','setLoading','setError','setAllRows','setServerTotal','setTruncated','FETCH_PAGE_SIZE','POLL_INTERVAL_MS','requestSeqRef','lastFetchStartedAtRef', `${js}; return effect()`)(document,importApi,setCount,{inbox:{unanswered:{list:fetch}}},vi.fn(),vi.fn(),vi.fn(),vi.fn(),vi.fn(),2000,pollInterval,{current:0},lastFetchStartedAtRef) as () => void
  return {fetch, setCount, cleanup, visibility(visible: boolean) {
    document.visibilityState = visible ? 'visible' : 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
  }}
}
afterEach(() => { vi.useRealTimers() })
for (const kind of ['sidebar', 'notifications'] as const) {
  describe(`${kind} visible-tab polling`, () => {
    const interval = 5 * 60_000
    test('hidden initial mount does not fetch; showing refreshes immediately', async () => {
      vi.useFakeTimers(); const app=mount(kind,false)
      await vi.advanceTimersByTimeAsync(interval*3)
      expect(app.fetch).toHaveBeenCalledTimes(0)
      expect(vi.getTimerCount()).toBe(0)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      app.cleanup()
    })
    test('visible initial mount fetches even at clock zero; polls every five minutes', async () => {
      vi.useFakeTimers(); vi.setSystemTime(0)
      const app = mount(kind, true)
      await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(interval - 1)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(app.fetch).toHaveBeenCalledTimes(2)
      app.cleanup()
    })
    test('return before one minute skips fetching but resumes the five-minute timer', async () => {
      vi.useFakeTimers(); const app = mount(kind, true)
      await vi.advanceTimersByTimeAsync(0)
      app.visibility(false)
      await vi.advanceTimersByTimeAsync(59_999)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(interval - 1)
      expect(app.fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(app.fetch).toHaveBeenCalledTimes(2)
      app.cleanup()
    })
    test('return at one minute fetches and uses that start for the next return', async () => {
      vi.useFakeTimers(); const app = mount(kind, true)
      await vi.advanceTimersByTimeAsync(0)
      app.visibility(false)
      await vi.advanceTimersByTimeAsync(60_000)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(2)
      app.visibility(false)
      await vi.advanceTimersByTimeAsync(59_999)
      app.visibility(true); await vi.advanceTimersByTimeAsync(0)
      expect(app.fetch).toHaveBeenCalledTimes(2)
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
      expect(app.fetch).toHaveBeenCalledTimes(3)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
}

test('notifications initial effect always fetches when React replays setup after cleanup', async () => {
  vi.useFakeTimers()
  const lastStart = { current: null as number | null }
  const first = mount('notifications', true, lastStart)
  await vi.advanceTimersByTimeAsync(0)
  first.cleanup()
  const replay = mount('notifications', true, lastStart)
  await vi.advanceTimersByTimeAsync(0)
  expect(first.fetch).toHaveBeenCalledTimes(1)
  expect(replay.fetch).toHaveBeenCalledTimes(1)
  replay.cleanup()
})
