export interface Point { x: number; y: number }
export interface LineMetric { distances: number[]; total: number }
export interface ProjectedTrack { points: Point[]; metric: LineMetric; key: string }

export function measureLine(points: Point[]): LineMetric {
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y))
  return { distances, total: distances.at(-1) ?? 0 }
}

export function pointOnTrack({ points, metric }: ProjectedTrack, progress: number): Point | null {
  if (points.length < 2 || !metric.total || metric.distances.length !== points.length) return null
  const distance = ((progress % 1 + 1) % 1) * metric.total
  let lo = 0, hi = metric.distances.length - 1
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (metric.distances[mid]! <= distance) lo = mid; else hi = mid }
  const length = metric.distances[hi]! - metric.distances[lo]!
  const t = length ? (distance - metric.distances[lo]!) / length : 0
  return { x: points[lo]!.x + (points[hi]!.x - points[lo]!.x) * t, y: points[lo]!.y + (points[hi]!.y - points[lo]!.y) * t }
}

export function createSurface() {
  const listeners = new Set<() => void>()
  const motionListeners = new Set<() => void>()
  return {
    country: '', selected: '', track: null as ProjectedTrack | null, revision: 0,
    moving: false,
    setMoving(value: boolean) {
      if (this.moving === value) return
      this.moving = value
      for (const listener of motionListeners) listener()
    },
    update(country: string, selected: string, track: ProjectedTrack | null) {
      this.country = country; this.selected = selected; this.track = track; this.revision++
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    subscribeMotion(listener: () => void) { motionListeners.add(listener); return () => { motionListeners.delete(listener) } },
  }
}
export type MapSurface = ReturnType<typeof createSurface>
