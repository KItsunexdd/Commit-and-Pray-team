import type { ParseState } from '../result/parse-session'

export const demoAddresses = [
  'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',
  'город Актобе/Ақтөбе қаласы, Назарбаева8',
  'Турксибский район, Рыбинский переулок, дом 4',
  'Туран 55/6 магазин береке 4подьезд 9этаж',
  '66квартал 12дом 69квартира',
] as const

export interface DemoState {
  phase: 'idle' | 'preparing' | 'typing' | 'parsing' | 'flying' | 'holding' | 'returning' | 'done'
  index: number
  paused: boolean
}
interface DemoActions {
  prepare(): void
  type(text: string): void
  parse(raw: string): void
  cancelPending(): void
  overview(): void
}
export const demoRunning = (state: DemoState) => state.phase !== 'idle' && state.phase !== 'done'

export function createDemoSession(actions: DemoActions) {
  let state: DemoState = { phase: 'idle', index: 0, paused: false }
  let timer: ReturnType<typeof setTimeout> | undefined
  let next: (() => void) | null = null
  let remaining = 0, deadline = 0, character = 0
  let expectedView: number | null = null, lastView: number | null = null
  let mapReady = false
  const listeners = new Set<() => void>()
  const publish = (patch: Partial<DemoState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const clear = () => { clearTimeout(timer); timer = undefined; next = null }
  const arm = () => {
    if (!next || state.paused) return
    deadline = Date.now() + remaining
    timer = setTimeout(() => { const action = next; clear(); action?.() }, remaining)
  }
  const schedule = (delay: number, action: () => void) => { clear(); remaining = delay; next = action; arm() }
  const stop = () => {
    clear(); expectedView = null; lastView = null
    publish({ phase: 'idle', paused: false })
    actions.cancelPending()
  }
  const beginAddress = (index: number) => {
    character = 0; expectedView = null; lastView = null
    publish({ phase: 'typing', index })
    actions.prepare()
    const text = demoAddresses[index]!
    const typeNext = () => {
      actions.type(text.slice(0, ++character))
      if (character < text.length) schedule(25, typeNext)
      else {
        publish({ phase: 'parsing' })
        actions.parse(text)
      }
    }
    schedule(25, typeNext)
  }
  const arrived = () => {
    if (state.paused || expectedView === null || expectedView !== lastView) return
    if (state.phase === 'flying') {
      publish({ phase: 'holding' })
      schedule(4000, () => {
        if (state.index + 1 < demoAddresses.length) beginAddress(state.index + 1)
        else {
          expectedView = -1; lastView = null
          publish({ phase: 'returning' })
          actions.overview()
        }
      })
    } else if (state.phase === 'returning') publish({ phase: 'done' })
  }
  return {
    configure(nextActions: DemoActions) { actions = nextActions },
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    start() {
      clear(); actions.cancelPending(); expectedView = null; lastView = null
      publish({ phase: 'preparing', index: 0, paused: false })
      if (mapReady) beginAddress(0)
    },
    mapReady(ready: boolean) {
      mapReady = ready
      if (ready && state.phase === 'preparing' && !state.paused) beginAddress(0)
    },
    stop,
    togglePause() {
      if (!demoRunning(state)) return
      if (!state.paused) {
        if (timer !== undefined) { remaining = Math.max(0, deadline - Date.now()); clearTimeout(timer); timer = undefined }
        publish({ paused: true })
      } else {
        publish({ paused: false })
        if (state.phase === 'preparing' && mapReady) beginAddress(0)
        else { arm(); arrived() }
      }
    },
    parsed(result: ParseState) {
      if (state.phase !== 'parsing' || !('raw' in result) || result.raw !== demoAddresses[state.index]) return
      if (result.status === 'error') {
        // Сохраняем штатную ошибку поиска; отмена запроса очистила бы её.
        clear(); expectedView = null
        publish({ phase: 'idle', paused: false })
      } else if (result.status === 'ready') {
        expectedView = result.revision
        publish({ phase: 'flying' })
        arrived()
      }
    },
    viewReady(revision: number) { lastView = revision; arrived() },
    dispose() { clear(); actions.cancelPending() },
  }
}
