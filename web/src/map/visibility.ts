export const visibilityKey = 'jana-map-visible'
export function loadMapVisibility(storage: Pick<Storage, 'getItem'>) {
  try { return storage.getItem(visibilityKey) !== 'false' } catch { return true }
}
export function saveMapVisibility(value: boolean, storage: Pick<Storage, 'setItem'>) {
  try { storage.setItem(visibilityKey, String(value)) } catch { /* Переключение работает без хранилища. */ }
}
export function isMapShortcut(event: KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null
  return event.code === 'KeyM' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing
    && !target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
}

// В закреплённом MapLibre 6.14 кадр хранится в AbortController. Одной остановки
// камеры недостаточно: источники и смена палитры могут запросить новый кадр.
export function renderingGate(map: { triggerRepaint(): void; _frameRequest?: AbortController | null }) {
  let visible = true
  const repaint = map.triggerRepaint
  map.triggerRepaint = function () { if (visible) repaint.call(map) }
  return {
    show(value: boolean) {
      visible = value
      if (!value) { map._frameRequest?.abort(); map._frameRequest = null }
      else map.triggerRepaint()
    },
    dispose() { map.triggerRepaint = repaint },
  }
}
