import type { Map as MapLibreMap } from 'maplibre-gl'

export function delayMapPreview(show: () => void, delay = 1200) {
  const timer = setTimeout(show, delay)
  return () => clearTimeout(timer)
}

// Даём SVG попасть в кадр до загрузки и разбора графического движка.
export function afterMapPaint(signal: AbortSignal, idle = true): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0
    let idleId = 0
    const cancel = () => {
      cancelAnimationFrame(frame)
      if (idleId) cancelIdleCallback(idleId)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => { cancel(); reject(signal.reason) }
    const done = () => { cancel(); resolve() }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (idle && 'requestIdleCallback' in window) idleId = requestIdleCallback(done, { timeout: 1000 })
        else done()
      })
    })
  })
}
// load/render могут произойти до готовности источников и окончательного кадра.
export function revealMapOnIdle(map: MapLibreMap, host: HTMLElement, reveal: () => void) {
  let stopped = false
  const stop = () => { stopped = true; map.off('idle', ready) }
  const ready = () => {
    if (stopped) return
    const canvas = map.getCanvas()
    if (!canvas.isConnected || !host.contains(canvas) || !canvas.width || !canvas.height) return
    stop(); reveal()
  }
  map.on('idle', ready)
  return stop
}
