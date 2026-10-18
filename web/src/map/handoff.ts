import type { JumpToOptions } from 'maplibre-gl'
import type { Place } from '../search/places'

export interface MapView {
  camera: JumpToOptions
  selection: Place | null
  remaining: number
}
export interface MapRequest { place: Place | null; duration: number }

// Новый выбор получает весь полёт; уже начатый продолжает оставшееся время.
export function handoffRequest(view: MapView, queued: MapRequest | null): MapRequest {
  return queued ?? { place: view.selection, duration: view.remaining }
}

export function createCameraFade(host: HTMLElement, labels: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    delete host.dataset.cameraFade; delete labels.dataset.cameraFade
  }
  return {
    cancel,
    run(change: () => void, done: () => void) {
      cancel()
      host.dataset.cameraFade = 'out'; labels.dataset.cameraFade = 'out'
      timer = setTimeout(() => {
        change()
        delete host.dataset.cameraFade; delete labels.dataset.cameraFade
        timer = setTimeout(done, 125)
      }, 125)
    },
  }
}
