import type { JumpToOptions, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { RegionCount } from '../analytics/model'
import { applyMapTheme, applySelectionColors, extrusionLayers } from './style'
import { subscribeTheme } from '../theme/store'
import type { Place } from '../search/places'
import type { MapData } from './data'
import { countryBounds } from './data'
import { createMapOverlay } from './overlay'
import type { OverlayState } from './overlay'
import type { MapStatus, MapTelemetry } from './Hud'
import { createSurface } from '../effects/contour'
import type { MapSurface } from '../effects/contour'
import { mapViewport, observeMapViewport } from './viewport'
import { displayCoordinates } from './coordinates'
import { overviewCamera } from './overview'
import { vertex } from './projection'
import { createCameraFade } from './handoff'
import type { MapView } from './handoff'
import { renderingGate } from './visibility'

export interface MapController {
  capture?: () => MapView
  restore?: (view: MapView) => void
  activate?: () => void
  display?: (visible: boolean) => void
  quality?: (economy: boolean) => void
  refreshLabels?: () => void
  zoom?: (direction: 'zoomIn' | 'zoomOut') => void
  select: (place: Place | null, duration?: number) => void
  interact: () => void
  motion: (paused: boolean) => void
  suspend: (paused: boolean) => void
  analysis: (regions: readonly RegionCount[] | null, select: (id: string) => void) => void
  dispose: () => void
}

export function createMapController(map: MapLibreMap, data: MapData, container: HTMLElement, labels: HTMLElement, svg: SVGSVGElement,
  onStatus: (status: MapStatus) => void, onTelemetry: (telemetry: MapTelemetry) => void, surface: MapSurface = createSurface(), economy = false,
  lowDetail = container.clientWidth < 640 || economy): MapController {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const scene: OverlayState = { selection: null, lift: {}, revision: 0, settled: false, layoutLabels: true }
  const bounds = countryBounds(data.directory)
  const countryPoints = data.outline.features.flatMap(feature => feature.geometry.type === 'LineString' ? feature.geometry.coordinates.map(vertex) : [])
  const compact = () => container.clientWidth < 640
  let liftFrame = 0
  let resumeLift: (() => void) | null = null
  let lastTelemetry = 0
  let paused = false
  let suspended = false
  let regionClick: ((id: string) => void) | null = null
  let flight: { options: JumpToOptions; remaining: number; started: number; done(): void } | null = null
  let disposed = false
  let visible = true
  const gate = renderingGate(map)
  let finishFlight: (() => void) | null = null
  let viewportKey = ''
  let restoring = false
  let viewport = mapViewport(container)
  const fade = createCameraFade(container, labels)
  map.addLayer(createMapOverlay(map, data, labels, svg, scene, surface))
  const stopTheme = subscribeTheme(() => { if (visible) applyMapTheme(map, lowDetail, scene.selection?.region.id ?? null) })

  const telemetry = () => {
    if (disposed) return
    lastTelemetry = performance.now()
    const center = displayCoordinates(scene.selection?.region ?? null, viewport, point => {
      const coordinate = map.unproject(point)
      return { lon: coordinate.lng, lat: coordinate.lat }
    })
    onTelemetry({ ...center, zoom: map.getZoom(), bearing: map.getBearing() })
  }
  const syncMotion = () => {
    if (document.hidden || suspended) { cancelAnimationFrame(liftFrame); liftFrame = 0 }
    else if (resumeLift && !liftFrame) resumeLift()
    labels.dataset.motion = document.hidden || reduced.matches || paused || suspended ? 'paused' : 'running'
  }
  const cancelFlight = () => {
    fade.cancel()
    if (finishFlight) map.off('moveend', finishFlight)
    finishFlight = null
    flight = null
    map.stop()
  }
  const runFlight = () => {
    if (!flight || suspended) return
    const current = flight
    const complete = () => { flight = null; current.done() }
    if (!current.remaining || document.hidden) { map.jumpTo(current.options); complete(); return }
    if (reduced.matches) { fade.run(() => map.jumpTo(current.options), complete); return }
    current.started = performance.now()
    finishFlight = complete
    map.once('moveend', complete)
    map.flyTo({ ...current.options, duration: current.remaining, curve: 1.15, essential: false })
  }
  const lift = () => {
    cancelAnimationFrame(liftFrame)
    const from = { ...scene.lift }
    const selectedId = scene.selection?.region.id
    const changed = [...new Set([...Object.keys(from), ...(selectedId ? [selectedId] : [])])]
      .filter(id => (from[id] ?? 0) !== (selectedId === id ? 1 : 0))
    if (!changed.length) {
      resumeLift = null
      return
    }
    let elapsed = 0
    let last = performance.now()
    const step = (now: number) => {
      liftFrame = 0
      if (disposed) return
      if (!document.hidden) elapsed += Math.min(now - last, 80)
      last = now
      const progress = reduced.matches || document.hidden ? 1 : Math.min(1, elapsed / 850)
      const t = 1 - Math.pow(1 - progress, 3)
      let updated = false
      for (const id of changed) {
        const to = selectedId === id ? 1 : 0
        const value = (from[id] ?? 0) + (to - (from[id] ?? 0)) * t
        if ((scene.lift[id] ?? 0) === value) continue
        if (value === 0) delete scene.lift[id]; else scene.lift[id] = value
        map.setFeatureState({ source: 'regions', id }, { lift: value })
        updated = true
      }
      if (updated) { scene.revision++; map.triggerRepaint() }
      if (progress < 1) liftFrame = requestAnimationFrame(step)
      else resumeLift = null
    }
    resumeLift = () => { last = performance.now(); liftFrame = requestAnimationFrame(step) }
    if (!suspended) step(last)
  }
  const select = (place: Place | null, duration = 2400) => {
    restoring = false
    cancelFlight()
    scene.selection = place
    scene.settled = false
    scene.revision++
    labels.dataset.selected = place ? 'true' : 'false'
    applySelectionColors(map, lowDetail, place?.region.id ?? null)
    lift()
    viewport = mapViewport(container)
    viewportKey = JSON.stringify(viewport)
    const { padding } = viewport
    const camera = map.cameraForBounds(place?.region.bbox ?? bounds, { padding, absolutePadding: true, bearing: -7, maxZoom: place ? place.region.kind === 'city' ? 9.5 : 10 : compact() ? 3.7 : 4.9 })
    const done = () => {
      if (disposed) return
      finishFlight = null
      scene.settled = !!place
      scene.layoutLabels = true
      scene.revision++
      onStatus(place ? place.region.kind === 'city' ? 'cityFound' : 'found' : 'ready')
      telemetry()
      map.triggerRepaint()
      syncMotion()
    }
    if (!camera) { done(); return }
    const options = !place && !compact() ? overviewCamera(map, camera, countryPoints, viewport) : { ...camera, padding, pitch: place ? 47 : 44 }
    flight = { options, remaining: duration, started: performance.now(), done }
    if (duration && !document.hidden) onStatus(place ? 'flying' : 'returning')
    runFlight()
  }
  const moving = () => { if (performance.now() - lastTelemetry >= 120) telemetry() }
  const moveStart = () => surface.setMoving(true)
  const moveEnd = () => {
    surface.setMoving(false)
    telemetry()
    scene.layoutLabels = true
    scene.revision++
    map.triggerRepaint()
  }
  const reducedChange = () => { if (reduced.matches) select(scene.selection, 0); syncMotion() }
  const visibilityChange = () => { if (document.hidden && finishFlight) select(scene.selection, 0); syncMotion() }
  const clickRegion = (event: MapMouseEvent) => {
    if (!regionClick) return
    const feature = map.queryRenderedFeatures(event.point, { layers: extrusionLayers(lowDetail).map(layer => layer.id) })[0]
    const id: unknown = feature?.properties.id
    if (typeof id === 'string' && data.directory.some(region => region.id === id)) regionClick(id)
  }
  map.on('click', clickRegion)
  map.on('move', moving)
  map.on('movestart', moveStart)
  map.on('moveend', moveEnd)
  document.addEventListener('visibilitychange', visibilityChange)
  reduced.addEventListener('change', reducedChange)
  const observe = () => observeMapViewport(container, () => {
    if (disposed || JSON.stringify(mapViewport(container)) === viewportKey) return
    const remaining = flight ? suspended ? flight.remaining : Math.max(1, flight.remaining - (performance.now() - flight.started)) : 0
    map.resize()
    map.setPixelRatio(Math.min(devicePixelRatio, economy ? 1 : compact() ? 1.5 : 2))
    if (restoring) { viewportKey = JSON.stringify(mapViewport(container)); return }
    select(scene.selection, remaining)
  })
  let stopObserving = observe()
  return {
    select, interact: () => {},
    display: value => {
      if (visible === value) return
      visible = value
      stopObserving()
      gate.show(value)
      if (value) {
        map.resize(); applyMapTheme(map, lowDetail, scene.selection?.region.id ?? null)
        if (JSON.stringify(mapViewport(container)) !== viewportKey) select(scene.selection, 0)
        stopObserving = observe()
      }
    },
    activate: () => { restoring = false; telemetry() },
    restore: view => {
      cancelFlight()
      restoring = true
      scene.selection = view.selection; scene.settled = !view.remaining; scene.revision++
      applySelectionColors(map, lowDetail, scene.selection?.region.id ?? null)
      labels.dataset.selected = view.selection ? 'true' : 'false'
      viewportKey = JSON.stringify(mapViewport(container))
      map.jumpTo(view.camera)
      lift()
    },
    quality: value => { economy = value; map.setPixelRatio(Math.min(devicePixelRatio, economy ? 1 : compact() ? 1.5 : 2)); syncMotion() },
    refreshLabels: () => { scene.layoutLabels = true; scene.revision++; map.triggerRepaint() },
    analysis: (regions, onSelect) => {
      regionClick = regions ? onSelect : null
      const colors = new Map(regions?.map(region => [region.id, region.color]))
      for (const region of data.directory) map.setFeatureState({ source: 'regions', id: region.id }, { analyticsColor: colors.get(region.id) ?? null })
      scene.layoutLabels = true; scene.revision++
      map.triggerRepaint(); syncMotion()
    },
    motion: (value) => { paused = value; syncMotion() },
    suspend: (value) => {
      if (suspended === value) return
      suspended = value
      if (value && flight && finishFlight) {
        flight.remaining = Math.max(0, flight.remaining - (performance.now() - flight.started))
        map.off('moveend', finishFlight)
        finishFlight = null
        map.stop()
      } else if (!value) runFlight()
      syncMotion()
    },
    dispose: () => {
      disposed = true
      cancelAnimationFrame(liftFrame)
      cancelFlight()
      stopObserving()
      stopTheme()
      gate.dispose()
      document.removeEventListener('visibilitychange', visibilityChange)
      reduced.removeEventListener('change', reducedChange)
      map.off('move', moving)
      map.off('movestart', moveStart)
      surface.setMoving(false)
      map.off('moveend', moveEnd)
      map.off('click', clickRegion)
    },
  }
}
