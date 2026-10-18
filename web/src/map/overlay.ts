import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import type { MapData } from './data'
import { surfaceHeight } from './style'
import type { Place } from '../search/places'
import { measureLine } from '../effects/contour'
import type { MapSurface, Point } from '../effects/contour'
import { vertex, projectVertex as project } from './projection'
import type { Vertex } from './projection'
import { createCityLabels } from './labels'
import { mapViewport } from './viewport'
import { lineLevels, setAttributeChanged, setStyleChanged, svgPath, svgStroke } from './simplify'

export interface OverlayState {
  selection: Place | null
  lift: Record<string, number>
  revision: number
  settled: boolean
  layoutLabels: boolean
}

export function createMapOverlay(map: MapLibreMap, data: MapData, container: HTMLElement, svg: SVGSVGElement, state: OverlayState, surface: MapSurface): CustomLayerInterface {
  const outlineLevels = lineLevels(data.outline.features.filter((feature) => feature.geometry.type === 'LineString')
    .map((feature) => (feature.geometry as GeoJSON.LineString).coordinates.map(vertex)))
  const borderLevels = lineLevels(data.borders.features.flatMap(({ geometry }) =>
    (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates).map((line) => line.map(vertex))))
  const countryPath = svg.querySelector<SVGPathElement>('[data-country]')!
  const borderPath = svg.querySelector<SVGPathElement>('[data-borders]')!
  const selectedPath = svg.querySelector<SVGPathElement>('[data-selected-region]')!
  const targetFrame = container.querySelector<HTMLElement>('[data-target-frame]')!
  const selectedCity = container.querySelector<HTMLElement>('[data-selected-city]')!
  const selectedName = selectedCity.querySelector<HTMLElement>('.map-city-name')!
  const regionLines = new Map(data.regions.features.map(({ properties, geometry }) => [properties.id,
    lineLevels((geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()).map((line) => line.map(vertex)))]))
  const tracks = new WeakMap<Vertex[][], { index: number; metric: ReturnType<typeof measureLine> }>()
  const track = (lines: Vertex[][]) => {
    let result = tracks.get(lines)
    if (!result) {
      result = lines.map((points, index) => ({ index, metric: measureLine(points) })).sort((a, b) => b.metric.total - a.metric.total)[0]!
      tracks.set(lines, result)
    }
    return result
  }
  const markers = [...container.querySelectorAll<HTMLElement>('[data-city]')].map((element) => {
    const region = data.directory.find((region) => region.id === element.dataset.city)!
    return { element, id: region.id, point: vertex([region.center.lon, region.center.lat]) }
  })
  let lastView = ''
  let lastCamera = ''
  let country = ''
  let projectedCountry: Point[][] = []
  let countryMaskDirty = true
  let countryTrack: { points: Point[]; metric: ReturnType<typeof measureLine>; key: string } | null = null
  const cityLabels = createCityLabels(container, data.directory, data.cities)

  return {
    id: 'elevated-overlays', type: 'custom', renderingMode: '3d',
    render(_gl, { defaultProjectionData }) {
      const width = container.clientWidth
      const height = container.clientHeight
      const matrix = defaultProjectionData.mainMatrix
      const camera = `${width},${height},${Array.from(matrix).join(',')}`
      const view = `${camera},${state.revision}`
      if (view === lastView) return
      lastView = view
      const zoom = map.getZoom(), elevation = surfaceHeight(zoom)
      const moving = map.isMoving()
      const projectLines = (lines: Vertex[][], altitude = elevation) => lines.map((line) => line.map((v) => project(v, altitude, matrix, width, height)))
      if (camera !== lastCamera) {
        lastCamera = camera
        const outline = outlineLevels(zoom), projected = projectLines(outline), metric = track(outline)
        projectedCountry = projected
        countryMaskDirty = true
        countryTrack = { points: projected[metric.index]!, metric: metric.metric, key: 'country' }
        setAttributeChanged(countryPath, 'd', svgStroke(projected, width, height))
        setAttributeChanged(borderPath, 'd', svgStroke(projectLines(borderLevels(zoom)), width, height))
      }
      // Canvas остановлен на время движения; полную маску собираем после подлёта.
      if (!moving && countryMaskDirty) { country = svgPath(projectedCountry); countryMaskDirty = false }
      const selected = state.selection
      for (const { element, point, id } of markers) {
        const p = project(point, surfaceHeight(map.getZoom(), state.lift[id] ?? 0), matrix, width, height)
        setStyleChanged(element, 'transform', `translate(${Math.round(p.x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`)
        setStyleChanged(element, 'visibility', (!selected || (!selected.city && selected.region.id === id)) && p.visible && p.x > 18 && p.x < width - 18 && p.y > 85 && p.y < height - 65 ? 'visible' : 'hidden')
        const regionCenter = !!selected && !selected.city && selected.region.id === id
        if (element.classList.contains('map-city--region-center') !== regionCenter) element.classList.toggle('map-city--region-center', regionCenter)
        cityLabels.position(id, p.x, p.y, element.style.visibility === 'visible')
      }
      if (state.layoutLabels) {
        cityLabels.layout(mapViewport(container))
        state.layoutLabels = false
      }
      let cityVisibility = 'hidden'
      let frameVisibility = 'hidden'
      if (!selected) {
        setStyleChanged(selectedCity, 'visibility', cityVisibility)
        setStyleChanged(targetFrame, 'visibility', frameVisibility)
        setAttributeChanged(selectedPath, 'd', '')
        if (!moving) surface.update(country, '', countryTrack)
        return
      }
      const altitude = surfaceHeight(zoom, state.lift[selected.region.id] ?? 0)
      const lines = regionLines.get(selected.region.id)!(zoom), projected = projectLines(lines, altitude)
      const selectedContour = svgStroke(projected, width, height)
      setAttributeChanged(selectedPath, 'd', selectedContour)
      const selectedTrack = track(lines)
      if (!moving) surface.update(country, svgPath(projected), { points: projected[selectedTrack.index]!, metric: selectedTrack.metric, key: selected.region.id })
      if (selected.city) {
        const p = project(vertex([selected.city.lon, selected.city.lat]), altitude, matrix, width, height)
        setStyleChanged(selectedCity, 'transform', `translate(${Math.round(p.x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`)
        cityVisibility = p.visible && p.x > 20 && p.x < width - 20 && p.y > 90 && p.y < height - 80 ? 'visible' : 'hidden'
        const name = selected.city.name.toLocaleUpperCase('ru')
        if (selectedName.textContent !== name) selectedName.textContent = name
      }
      setStyleChanged(selectedCity, 'visibility', cityVisibility)
      if (state.settled) {
        const points = projected.flat().filter((point) => point.visible)
        if (!points.length) { setStyleChanged(targetFrame, 'visibility', frameVisibility); return }
        const left = Math.max(22, Math.min(...points.map((p) => p.x)) - 12)
        const top = Math.max(85, Math.min(...points.map((p) => p.y)) - 12)
        const right = Math.min(width - 22, Math.max(...points.map((p) => p.x)) + 12)
        const bottom = Math.min(height - 90, Math.max(...points.map((p) => p.y)) + 12)
        if (right > left && bottom > top) {
          frameVisibility = 'visible'
          setStyleChanged(targetFrame, 'left', `${Math.round(left)}px`)
          setStyleChanged(targetFrame, 'top', `${Math.round(top)}px`)
          setStyleChanged(targetFrame, 'width', `${Math.round(right - left)}px`)
          setStyleChanged(targetFrame, 'height', `${Math.round(bottom - top)}px`)
        }
      }
      setStyleChanged(targetFrame, 'visibility', frameVisibility)
    },
  }
}
