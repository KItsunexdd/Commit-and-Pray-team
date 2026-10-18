import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ParseState } from '../result/parse-session'
import { createDemoSession, demoRunning } from './session'
import { isMapShortcut } from '../map/visibility'

export function useDemo({ parseState, mapReady, mapEnabled = true, prepare, type, parse, cancelPending, overview, openMain }: {
  mapReady: boolean
  mapEnabled?: boolean
  parseState: ParseState; prepare(): void; type(text: string): void; parse(raw: string): void
  cancelPending(): void; overview(): void; openMain(): void
}) {
  const actions = useRef({ prepare, type, parse, cancelPending, overview, openMain })
  const [session] = useState(() => createDemoSession({ prepare, type, parse, cancelPending, overview }))
  useLayoutEffect(() => {
    actions.current = { prepare, type, parse, cancelPending, overview, openMain }
    session.configure({ prepare, type, parse, cancelPending, overview })
  })
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [mapView, setMapView] = useState<number | null>(null)
  useEffect(() => { session.mapReady(mapReady) }, [session, mapReady])
  useEffect(() => { session.parsed(parseState) }, [session, parseState])
  useEffect(() => { if (mapView !== null) session.viewReady(mapView) }, [session, mapView])
  useEffect(() => {
    if (mapEnabled) return
    if (state.phase === 'flying' && parseState.status === 'ready') session.viewReady(parseState.revision)
    if (state.phase === 'returning') session.viewReady(-1)
  }, [session, mapEnabled, parseState, state.phase])

  const start = () => {
    // Программное заполнение не открывает экранную клавиатуру.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    actions.current.openMain()
    session.start()
  }
  useEffect(() => {
    const launch = () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      actions.current.openMain()
      session.start()
    }
    const auto = new URLSearchParams(location.search).get('demo') === '1'
    // Отложенный старт позволяет StrictMode отменить пробное подключение.
    const timer = auto ? setTimeout(launch, 0) : undefined
    const input = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      if (event instanceof KeyboardEvent) {
        if (isMapShortcut(event)) return
        if (event.isComposing) { if (demoRunning(session.getSnapshot())) session.stop(); return }
        if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'KeyD') {
          event.preventDefault()
          if (!event.repeat) {
            if (demoRunning(session.getSnapshot())) session.stop()
            else launch()
          }
          return
        }
        if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key)) return
        if (event.key === 'Escape' && demoRunning(session.getSnapshot())) {
          event.preventDefault(); event.stopPropagation(); session.stop(); return
        }
      }
      if (target?.closest('[data-demo-control]')) return
      if (session.getSnapshot().phase !== 'idle') session.stop()
    }
    const route = () => { if (location.hash === '#files' || location.hash === '#about') session.stop() }
    const hide = () => { if (document.hidden && demoRunning(session.getSnapshot()) && !session.getSnapshot().paused) session.togglePause() }
    for (const event of ['pointerdown', 'keydown', 'input', 'wheel']) document.addEventListener(event, input, { capture: true, passive: event === 'wheel' })
    window.addEventListener('hashchange', route)
    document.addEventListener('visibilitychange', hide)
    return () => {
      clearTimeout(timer)
      for (const event of ['pointerdown', 'keydown', 'input', 'wheel']) document.removeEventListener(event, input, true)
      window.removeEventListener('hashchange', route)
      document.removeEventListener('visibilitychange', hide)
      session.dispose()
    }
  }, [session])
  return { state, active: demoRunning(state), start, stop: session.stop, togglePause: session.togglePause, onViewReady: setMapView }
}
