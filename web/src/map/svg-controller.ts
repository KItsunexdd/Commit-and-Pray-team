import type { Place } from '../search/places'
import type { MapData } from './data'
import type { MapController } from './controller'
import type { MapStatus, MapTelemetry } from './Hud'
import type { MapSurface } from '../effects/contour'
import { measureLine } from '../effects/contour'
import { fitView, project, scaleView, svgPath } from './svg-geometry'
import type { View } from './svg-geometry'
import { ru } from '../i18n/ru'
import { mapViewport, observeMapViewport } from './viewport'
import { displayCoordinates } from './coordinates'
import { createCityLabels } from './labels'
import type { RegionCount } from '../analytics/model'
import { createCameraFade } from './handoff'
import { svgPerspective } from './svg-perspective'
import { regionColor } from './style'
import { colors, subscribeTheme } from '../theme/store'

export function createSvgController(data: MapData, container: HTMLElement, labels: HTMLElement,
  contours: SVGSVGElement, onStatus: (status: MapStatus) => void,
  onTelemetry: (telemetry: MapTelemetry) => void, surface: MapSurface): MapController {
  const namespace = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(namespace, 'svg')
  svg.classList.add('map-svg')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', ru.map.svgAccessibleName)
  svg.setAttribute('tabindex', '0')
  const group = document.createElementNS(namespace, 'g')
  svg.append(group)
  container.append(svg)
  const path = svgPath()
  const features = new Map(data.regions.features.map(feature => [feature.properties.id, feature]))
  const shapes = data.regions.features.map((feature) => {
    const shape = document.createElementNS(namespace, 'path')
    shape.setAttribute('d', path(feature) ?? '')
    shape.setAttribute('fill', regionColor(feature.properties.id))
    shape.setAttribute('fill-rule', 'evenodd')
    shape.dataset.region = feature.properties.id
    shape.setAttribute('vector-effect', 'non-scaling-stroke')
    group.append(shape)
    return shape
  })
  const plates = [12, 6].map(offset => {
    const plate = group.cloneNode(true) as SVGGElement
    plate.classList.add('map-svg-plate')
    plate.style.color = offset === 12 ? 'var(--map-plate-0)' : 'var(--map-plate-1)'
    svg.insertBefore(plate, group)
    return { plate, offset }
  })
  const country = data.outline.features.find(feature => feature.properties.part === 'country')!
  const line = data.outline.features.find(feature => feature.geometry.type === 'LineString')
  const linePoints = line?.geometry.type === 'LineString' ? line.geometry.coordinates.map(([lon, lat]) => {
    const [x, y] = project([lon!, lat!])!; return { x, y }
  }) : []
  const metric = measureLine(linePoints)
  let view: View = { x: 0, y: 0, k: 1 }
  let overviewScale = 1
  let selection: Place | null = null
  let frame = 0
  let wheelTimer = 0
  let disposed = false
  let visible = true
  let paused = false
  let suspended = false
  let regionClick: ((id: string) => void) | null = null
  let analyticsRegions: readonly RegionCount[] | null = null
  const recolor = () => {
    const palette = colors(), analysis = new Map(analyticsRegions?.map(region => [region.id, region.color]))
    shapes.forEach(shape => shape.setAttribute('fill', analysis.get(shape.dataset.region!) ?? regionColor(shape.dataset.region!, palette)))
  }
  const stopTheme = subscribeTheme(recolor)
  let deferredMove: { view: View; duration: number } | null = null
  let flightEnd = 0
  let target: View | null = null
  let viewportKey = ''
  let layout = mapViewport(container)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const selectedCity = labels.querySelector<HTMLElement>('[data-selected-city]')!
  const targetFrame = labels.querySelector<HTMLElement>('[data-target-frame]')!
  const cityLabels = createCityLabels(labels, data.directory, data.cities)
  const fade = createCameraFade(container, labels)

  const position = (element: HTMLElement, lon: number, lat: number, visible: boolean) => {
    const point = project([lon, lat])!
    const [x, y] = svgPerspective(layout, container.clientHeight).screen([point[0] * view.k + view.x, point[1] * view.k + view.y])
    element.style.transform = `translate(${x}px, ${y}px)`
    element.style.visibility = visible && x > 15 && x < container.clientWidth - 15 && y > 15 && y < container.clientHeight - 30 ? 'visible' : 'hidden'
    if (element.dataset.city) cityLabels.position(element.dataset.city, x, y, element.style.visibility === 'visible')
  }
  const render = () => {
    if (disposed || !visible) return
    const perspective = svgPerspective(layout, container.clientHeight)
    svg.style.transform = perspective.transform
    svg.style.transformOrigin = perspective.origin
    group.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`)
    for (const { plate, offset } of plates) plate.setAttribute('transform', `translate(${view.x},${view.y + offset}) scale(${view.k})`)
    const screenPath = svgPath(view, perspective.screen)
    const feature = selection ? features.get(selection.region.id) : undefined
    const countryPath = screenPath(country) ?? '', selectedPath = feature ? screenPath(feature) ?? '' : ''
    contours.querySelector('[data-country]')!.setAttribute('d', countryPath)
    contours.querySelector('[data-borders]')!.setAttribute('d', screenPath(data.borders) ?? '')
    contours.querySelector('[data-selected-region]')!.setAttribute('d', selectedPath)
    surface.update(countryPath, selectedPath, { points: linePoints.map(p => {
      const [x, y] = perspective.screen([p.x * view.k + view.x, p.y * view.k + view.y]); return { x, y }
    }), metric, key: 'svg-country' })
    for (const region of data.directory) {
      const element = labels.querySelector<HTMLElement>(`[data-city="${region.id}"]`)
      if (!element) continue
      element.classList.toggle('map-city--region-center', selection?.region.id === region.id && !selection.city)
      position(element, region.center.lon, region.center.lat, !selection || (selection.region.id === region.id && !selection.city))
    }
    if (selection?.city) {
      selectedCity.querySelector('.map-city-name')!.textContent = selection.city.name.toLocaleUpperCase('ru')
      position(selectedCity, selection.city.lon, selection.city.lat, true)
    } else selectedCity.style.visibility = 'hidden'
    targetFrame.style.visibility = feature && !target ? 'visible' : 'hidden'
    if (feature) {
      const [[x0, y0], [x1, y1]] = screenPath.bounds(feature)
      Object.assign(targetFrame.style, { left: `${x0 - 10}px`, top: `${y0 - 10}px`, width: `${x1 - x0 + 20}px`, height: `${y1 - y0 + 20}px` })
    }
    const center = displayCoordinates(selection?.region ?? null, layout, ([x, y]) => {
      const coordinate = project.invert!([(x - view.x) / view.k, (y - view.y) / view.k])!
      return { lon: coordinate[0], lat: coordinate[1] }
    })
    onTelemetry({ ...center, zoom: Math.log2(view.k / overviewScale) + 3, bearing: 0 })
  }
  const ready = () => {
    surface.setMoving(false)
    cityLabels.layout(layout)
    onStatus(selection ? selection.region.kind === 'city' ? 'cityFound' : 'found' : 'ready')
  }
  const stop = () => { fade.cancel(); cancelAnimationFrame(frame); clearTimeout(wheelTimer); frame = 0; target = null; surface.setMoving(false) }
  const move = (next: View, duration: number) => {
    stop()
    deferredMove = null
    if (suspended) { deferredMove = { view: next, duration }; return }
    if (!duration || document.hidden) { view = next; render(); ready(); return }
    surface.setMoving(true)
    if (reduced.matches) {
      target = next; flightEnd = performance.now() + 250
      onStatus(selection ? 'flying' : 'returning')
      fade.run(() => { view = next; render() }, () => { target = null; ready() })
      return
    }
    const from = view, started = performance.now()
    flightEnd = started + duration
    target = next
    onStatus(selection ? 'flying' : 'returning')
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration), t = 1 - (1 - progress) ** 3
      const k = from.k * (next.k / from.k) ** t
      const cx = container.clientWidth / 2, cy = container.clientHeight * .6
      view = { k, x: cx - ((cx - from.x) / from.k * (1 - t) + (cx - next.x) / next.k * t) * k,
        y: cy - ((cy - from.y) / from.k * (1 - t) + (cy - next.y) / next.k * t) * k }
      if (progress === 1) { target = null; frame = 0 }
      render()
      if (progress < 1) frame = requestAnimationFrame(step)
      else ready()
    }
    frame = requestAnimationFrame(step)
  }
  const select = (place: Place | null, duration = 2400) => {
    selection = place
    labels.dataset.selected = place ? 'true' : 'false'
    shapes.forEach((shape, index) => {
      const selected = data.regions.features[index]!.properties.id === place?.region.id
      shape.style.opacity = place && !selected ? '.25' : '1'
      shape.classList.toggle('map-svg-selected', selected)
      shape.classList.toggle('map-svg-dim', !!place && !selected)
      for (const { plate } of plates) {
        const copy = plate.children[index] as SVGPathElement
        copy.style.opacity = shape.style.opacity
      }
    })
    layout = mapViewport(container)
    viewportKey = JSON.stringify(layout)
    const { left, top, right, bottom } = layout
    const viewport: [[number, number], [number, number]] = [[left, top], [right, bottom]]
    const perspective = svgPerspective(layout, container.clientHeight)
    const fit = (feature: typeof country | MapData['regions']['features'][number]) => {
      let next = fitView(path.bounds(feature), viewport)
      // Вписываем уже наклонённый силуэт в ту же свободную рамку, что у 3D.
      for (let step = 0; step < 6; step++) {
        const [[x0, y0], [x1, y1]] = svgPath(next, perspective.screen).bounds(feature)
        const center = perspective.plane([(x0 + x1) / 2, (y0 + y1) / 2])
        next.x += perspective.cx - center[0]; next.y += perspective.cy - center[1]
        const ratio = Math.min(layout.width / (x1 - x0), layout.height / (y1 - y0)) * .92
        next = scaleView(next, ratio, [perspective.cx, perspective.cy], 1, 1e8)
      }
      if (place?.region.kind === 'city') next = scaleView(next, 1, [perspective.cx, perspective.cy], 1, 512 * 2 ** 9.5 / (2 * Math.PI))
      return next
    }
    const overview = fit(country)
    overviewScale = overview.k
    const feature = place ? features.get(place.region.id) : undefined
    move(feature ? fit(feature) : overview, duration)
  }
  const settle = () => {
    if (target && !suspended && (document.hidden || reduced.matches)) { const next = target; stop(); view = next; render(); ready() }
    labels.dataset.motion = paused || suspended || reduced.matches || document.hidden ? 'paused' : 'running'
  }
  const zoom = (direction: 'zoomIn' | 'zoomOut') => move(scaleView(view, direction === 'zoomIn' ? 1.4 : 1 / 1.4,
    [container.clientWidth / 2, container.clientHeight * .6], overviewScale * .65, overviewScale * 150), 250)
  const pointers = new Map<number, [number, number]>()
  let tap: { x: number; y: number; id: string; moved: boolean } | null = null
  const pointerdown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const id = event.target instanceof SVGElement ? event.target.dataset.region : undefined
    tap = pointers.size || !id ? null : { x: event.clientX, y: event.clientY, id, moved: false }
    stop(); surface.setMoving(true); pointers.set(event.pointerId, [event.clientX, event.clientY]); svg.setPointerCapture(event.pointerId)
  }
  const pointermove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    surface.setMoving(true)
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) tap.moved = true
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
    if (other) {
      const before = Math.hypot(previous[0] - other[0], previous[1] - other[1])
      const after = Math.hypot(event.clientX - other[0], event.clientY - other[1])
      const rect = container.getBoundingClientRect()
      const center = svgPerspective(layout, container.clientHeight).plane([other[0] - rect.left, other[1] - rect.top])
      view = scaleView(view, before ? after / before : 1, center, overviewScale * .65, overviewScale * 150)
    } else {
      const rect = container.getBoundingClientRect(), perspective = svgPerspective(layout, container.clientHeight)
      const before = perspective.plane([previous[0] - rect.left, previous[1] - rect.top])
      const after = perspective.plane([event.clientX - rect.left, event.clientY - rect.top])
      view = { ...view, x: view.x + after[0] - before[0], y: view.y + after[1] - before[1] }
    }
    pointers.set(event.pointerId, [event.clientX, event.clientY]); render()
  }
  const pointerup = (event: PointerEvent) => {
    pointers.delete(event.pointerId); ready()
    if (event.type === 'pointerup' && tap && !tap.moved) regionClick?.(tap.id)
    tap = null
  }
  const wheel = (event: WheelEvent) => {
    event.preventDefault(); stop(); surface.setMoving(true)
    const rect = container.getBoundingClientRect()
    const center = svgPerspective(layout, container.clientHeight).plane([event.clientX - rect.left, event.clientY - rect.top])
    view = scaleView(view, Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .003), center, overviewScale * .65, overviewScale * 150)
    render()
    wheelTimer = window.setTimeout(ready, 120)
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom('zoomIn') }
    else if (event.key === '-') { event.preventDefault(); zoom('zoomOut') }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault(); stop()
      view = { ...view, x: view.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), y: view.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) }
      render(); ready()
    }
  }
  svg.addEventListener('pointerdown', pointerdown)
  svg.addEventListener('pointermove', pointermove)
  svg.addEventListener('pointerup', pointerup)
  svg.addEventListener('pointercancel', pointerup)
  svg.addEventListener('wheel', wheel, { passive: false })
  svg.addEventListener('keydown', keydown)
  document.addEventListener('visibilitychange', settle)
  reduced.addEventListener('change', settle)
  const observe = () => observeMapViewport(container, () => {
    if (JSON.stringify(mapViewport(container)) !== viewportKey) select(selection, deferredMove?.duration ?? (target ? Math.max(1, flightEnd - performance.now()) : 0))
  })
  let stopObserving = observe()
  return { select, zoom, interact: stop, motion(value) { paused = value; settle() },
    display(value) {
      if (visible === value) return
      visible = value; stopObserving()
      if (value) { stopObserving = observe(); render() }
    },
    capture() {
      return { camera: svgPerspective(layout, container.clientHeight).camera(view),
        selection, remaining: deferredMove?.duration ?? (target ? Math.max(1, flightEnd - performance.now()) : 0) }
    },
    refreshLabels() { cityLabels.layout(layout) },
    analysis(regions: readonly RegionCount[] | null, onSelect: (id: string) => void) {
      analyticsRegions = regions
      regionClick = regions ? onSelect : null
      const colors = new Map(regions?.map(region => [region.id, region.color]))
      shapes.forEach(shape => shape.setAttribute('fill', colors.get(shape.dataset.region!) ?? regionColor(shape.dataset.region!)))
      cityLabels.layout(layout)
    },
    suspend(value) {
      if (suspended === value) return
      suspended = value
      if (value && target) {
        const pending = { view: target, duration: Math.max(0, flightEnd - performance.now()) }
        stop(); deferredMove = pending
      } else if (!value && deferredMove) {
        const pending = deferredMove
        move(pending.view, pending.duration)
      }
      labels.dataset.motion = paused || suspended || reduced.matches || document.hidden ? 'paused' : 'running'
    }, dispose() {
    disposed = true; stop(); stopObserving(); stopTheme()
    labels.style.removeProperty('transform'); labels.style.removeProperty('transform-origin')
    document.removeEventListener('visibilitychange', settle)
    reduced.removeEventListener('change', settle)
    svg.remove()
  } }
}
