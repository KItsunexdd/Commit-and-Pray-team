interface Point { x: number; y: number }

// Douglas–Peucker в координатах Меркатора. Концы линий и замыкание сохраняются.
export function simplifyLine<T extends Point>(points: readonly T[], tolerance: number): T[] {
  if (points.length <= 2 || tolerance <= 0) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [0, points.length - 1]
  const limit = tolerance * tolerance
  while (stack.length) {
    const end = stack.pop()!, start = stack.pop()!
    const a = points[start]!, b = points[end]!, dx = b.x - a.x, dy = b.y - a.y
    const length = dx * dx + dy * dy
    let farthest = -1, maximum = limit
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!
      const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
      const distance = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2
      if (distance > maximum) { maximum = distance; farthest = i }
    }
    if (farthest >= 0) { keep[farthest] = 1; stack.push(start, farthest, farthest, end) }
  }
  return points.filter((_, index) => keep[index])
}

export function lineLevels<T extends Point>(lines: readonly T[][]) {
  const levels = new Map<number, T[][]>()
  return (zoom: number) => {
    const level = Math.max(4, Math.min(12, Math.floor(zoom)))
    let result = levels.get(level)
    if (!result) {
      result = lines.map(line => simplifyLine(line, 1 / (512 * 2 ** level)))
      levels.set(level, result)
    }
    return result
  }
}

export function svgPath(lines: readonly Point[][]): string {
  const parts: string[] = []
  for (const line of lines) for (let i = 0; i < line.length; i++) {
    const p = line[i]!
    parts.push(`${i ? 'L' : 'M'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`)
  }
  return parts.join('')
}

// Отбрасываем только целиком невидимые отрезки штриха. Разрывы не замыкаем:
// для заливки маски эффектов по-прежнему нужен полный svgPath.
export function svgStroke(lines: readonly Point[][], width: number, height: number): string {
  const parts: string[] = []
  const code = (p: Point) => (p.x < -12 ? 1 : p.x > width + 12 ? 2 : 0) | (p.y < -12 ? 4 : p.y > height + 12 ? 8 : 0)
  const point = (p: Point) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`
  for (const line of lines) {
    let connected = false
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!, b = line[i]!
      if (code(a) & code(b)) { connected = false; continue }
      if (!connected) parts.push(`M${point(a)}`)
      parts.push(`L${point(b)}`)
      connected = true
    }
  }
  return parts.join('')
}

export function setAttributeChanged(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value)
}

export function setStyleChanged(element: HTMLElement, name: 'transform' | 'visibility' | 'left' | 'top' | 'width' | 'height', value: string) {
  if (element.style[name] !== value) element.style[name] = value
}
