import type { RegionInfo } from './data'
import type { CityInfo } from '../search/places'
import { setStyleChanged } from './simplify'

export interface LabelBox { left: number; top: number; right: number; bottom: number }
export interface CityLabel { id: string; x: number; y: number; width: number; height: number; priority: number }
export interface LabelPlacement { id: string; dx: number; dy: number; box: LabelBox }

export function labelPriorities(regions: RegionInfo[], cities: CityInfo[]): Map<string, number> {
  const capitals = ['KZ-71', 'KZ-75', 'KZ-79']
  const population = (region: RegionInfo) => cities.find(city => city.region_id === region.id
    && city.name === region.center.name)?.population ?? 0
  const ranked = [...regions].sort((a, b) => {
    const first = capitals.indexOf(a.id), second = capitals.indexOf(b.id)
    if (first >= 0 || second >= 0) return (first < 0 ? 3 : first) - (second < 0 ? 3 : second)
    return population(b) - population(a) || a.id.localeCompare(b.id)
  })
  return new Map(ranked.map((region, index) => [region.id, index]))
}

const intersects = (a: LabelBox, b: LabelBox, gap = 4) => a.left < b.right + gap && a.right + gap > b.left
  && a.top < b.bottom + gap && a.bottom + gap > b.top

export function placeLabels(labels: CityLabel[], viewport: LabelBox, occupied: LabelBox[] = []): LabelPlacement[] {
  const placed: LabelPlacement[] = []
  const dots = labels.map(({ x, y }) => ({ left: x - 3, right: x + 3, top: y - 3, bottom: y + 3 }))
  for (const label of [...labels].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    const { id, x, y, width, height } = label
    // Сначала над точкой; затем слева, справа и снизу. Точки не скрываем.
    const candidates = [[-width / 2, -height - 9], [-width - 10, -height / 2], [10, -height / 2], [-width / 2, 9]]
    for (const [dx, dy] of candidates as [number, number][]) {
      const box = { left: x + dx, top: y + dy, right: x + dx + width, bottom: y + dy + height }
      if (box.left < viewport.left || box.top < viewport.top || box.right > viewport.right || box.bottom > viewport.bottom) continue
      if (placed.some(other => intersects(box, other.box)) || occupied.some(other => intersects(box, other)) || dots.some(dot => intersects(box, dot, 2))) continue
      placed.push({ id, dx, dy, box })
      break
    }
  }
  return placed
}

// Размеры читаются одним проходом только при завершении движения, перед всеми записями в DOM.
export function createCityLabels(container: HTMLElement, regions: RegionInfo[], cities: CityInfo[]) {
  const priorities = labelPriorities(regions, cities)
  const markers = [...container.querySelectorAll<HTMLElement>('[data-city]')].map(element => ({
    element, name: element.querySelector<HTMLElement>('.map-city-name')!,
    id: element.dataset.city!, x: 0, y: 0, visible: false,
  }))
  const byId = new Map(markers.map(marker => [marker.id, marker]))
  return {
    position(id: string, x: number, y: number, visible: boolean) {
      const marker = byId.get(id)
      if (marker) Object.assign(marker, { x, y, visible })
    },
    layout(viewport: LabelBox) {
      const origin = container.getBoundingClientRect()
      const counts = markers.filter(marker => marker.visible).flatMap(marker => {
        const rect = marker.element.querySelector('.map-city-count')?.getBoundingClientRect()
        return rect ? [{ left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top }] : []
      })
      const measurements = markers.filter(marker => marker.visible).map(marker => ({
        id: marker.id, x: marker.x, y: marker.y, width: marker.name.offsetWidth, height: marker.name.offsetHeight,
        priority: priorities.get(marker.id) ?? regions.length,
      }))
      const placements = new Map(placeLabels(measurements, viewport, counts).map(placement => [placement.id, placement]))
      for (const marker of markers) {
        const placement = placements.get(marker.id)
        setStyleChanged(marker.name, 'visibility', placement ? '' : 'hidden')
        if (placement) setStyleChanged(marker.name, 'transform', `translate(${placement.dx}px, ${placement.dy}px)`)
      }
    },
  }
}
