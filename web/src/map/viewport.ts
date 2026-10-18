export interface MapViewport {
  left: number; top: number; right: number; bottom: number
  width: number; height: number
  padding: { left: number; top: number; right: number; bottom: number }
}

const uiSelectors = ['.app-header', '.map-hero', '[data-result-panel]', '.map-selection', '.map-controls', '.map-attribution']

export function mapViewport(container: HTMLElement): MapViewport {
  const origin = container.getBoundingClientRect()
  const width = container.clientWidth, height = container.clientHeight
  const app = container.closest('.app-shell')
  const edge = width < 640 ? 24 : 36, gap = 24
  const visible = (selector: string) => {
    const element = app?.querySelector<HTMLElement>(selector)
    if (!element || element.hidden || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return null
    return element.getBoundingClientRect()
  }
  let top = edge, left = edge, right = width - edge, bottom = height - edge
  for (const selector of ['.app-header', '.map-hero']) {
    const rect = visible(selector)
    if (rect) top = Math.max(top, rect.bottom - origin.top + gap)
  }
  const panel = visible('[data-result-panel]')
  if (panel) {
    if (width >= 1000) right = Math.min(right, panel.left - origin.left - gap)
    else bottom = Math.min(bottom, panel.top - origin.top - gap)
  }
  for (const selector of [...(width < 1000 ? ['.map-selection'] : []), '.map-controls', '.map-attribution']) {
    const rect = visible(selector)
    if (rect && rect.bottom - origin.top > top) bottom = Math.min(bottom, rect.top - origin.top - gap)
  }
  left = Math.min(left, right - 1)
  top = Math.min(top, height - edge)
  // Развёрнутая шторка может закрыть карту целиком. Не создаём отрицательные отступы.
  bottom = Math.max(top + 1, bottom)
  return { left, top, right, bottom, width: right - left, height: bottom - top,
    padding: { left, top, right: width - right, bottom: height - bottom } }
}

export function observeMapViewport(container: HTMLElement, changed: () => void) {
  const app = container.closest('.app-shell')
  let last = JSON.stringify(mapViewport(container)), frame = 0
  const targets = new Set<Element>()
  const refresh = () => {
    const next = new Set<Element>([container, ...uiSelectors.flatMap(selector => [...(app?.querySelectorAll(selector) ?? [])])])
    for (const target of targets) if (!next.has(target)) { observer.unobserve(target); targets.delete(target) }
    for (const target of next) if (!targets.has(target)) { observer.observe(target); targets.add(target) }
    const signature = JSON.stringify(mapViewport(container))
    if (signature !== last) { last = signature; changed() }
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh) }
  const observer = new ResizeObserver(schedule)
  const mutations = new MutationObserver(schedule)
  if (app) mutations.observe(app, { childList: true })
  if (container.parentElement) mutations.observe(container.parentElement, { childList: true })
  window.visualViewport?.addEventListener('resize', schedule)
  refresh()
  return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.visualViewport?.removeEventListener('resize', schedule) }
}
