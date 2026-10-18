import { colors, currentTheme } from '../theme/store'
import { ru } from '../i18n/ru'
import { pointOnTrack } from './contour'
import type { MapSurface } from './contour'
import { effectProfile } from './quality'
import type { Palette } from '../theme/palette'

function drawPulse(context: CanvasRenderingContext2D, surface: MapSurface, time: number, steps: number, palette: Palette, light: boolean) {
  if (!surface.track) return null
  const phase = time / 10
  let previous = pointOnTrack(surface.track, phase - .065)
  let left = previous?.x ?? Infinity, top = previous?.y ?? Infinity, right = left, bottom = top
  context.lineCap = 'round'
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, point = pointOnTrack(surface.track, phase - .065 * (1 - t))
    if (point && previous) {
      left = Math.min(left, point.x); top = Math.min(top, point.y)
      right = Math.max(right, point.x); bottom = Math.max(bottom, point.y)
      context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(point.x, point.y)
      context.strokeStyle = palette['fx-pulse']; context.globalAlpha = t * t * (light ? .07 : .14); context.lineWidth = 6; context.stroke()
      context.strokeStyle = palette['fx-pulse-core']; context.globalAlpha = t * t * .95; context.lineWidth = 1.6; context.stroke()
    }
    previous = point
  }
  context.globalAlpha = 1
  if (!previous) return null
  context.beginPath(); context.arc(previous.x, previous.y, 1.5, 0, Math.PI * 2)
  context.fillStyle = palette['fx-pulse-dot']; context.fill()
  return { left: left - 5, top: top - 5, right: right + 5, bottom: bottom + 5 }
}

export function createPainter(context: CanvasRenderingContext2D, surface: MapSurface, width: number, height: number,
  profile: ReturnType<typeof effectProfile>, reduced: boolean, keepClear: DOMRect[]) {
  const palette = colors(), light = currentTheme() === 'light'
  if (light) {
    let dirty: ReturnType<typeof drawPulse> = null
    return (time: number) => {
      if (dirty) {
        const left = Math.max(0, dirty.left), top = Math.max(0, dirty.top)
        const right = Math.min(width, dirty.right), bottom = Math.min(height, dirty.bottom)
        if (right > left && bottom > top) context.clearRect(left, top, right - left, bottom - top)
      }
      dirty = reduced ? null : drawPulse(context, surface, time, profile.pulseSteps, palette, true)
    }
  }
  let revision = -1
  let mask: Path2D | null = null
  const vignette = context.createRadialGradient(width / 2, height * .53, width * .12, width / 2, height * .53, Math.max(width, height) * .7)
  vignette.addColorStop(0, palette['fx-vignette-clear']); vignette.addColorStop(1, palette['fx-vignette'])
  const dots = Array.from({ length: profile.particles }, (_, i) => ({ x: ((i * 137 + 41) % 997) / 997, y: ((i * 233 + 61) % 991) / 991, speed: 1.5 + (i % 4) * .6 }))
  return (time: number) => {
    context.clearRect(0, 0, width, height)

    // Низкая частота и амплитуда сохраняют спокойный фон за картой.
    context.lineWidth = .65
    for (let line = 0; line < (light ? 0 : profile.waves); line++) {
      context.beginPath()
      for (let x = 0; x <= width + 18; x += 18) {
        const u = x / width
        const amplitude = Math.min(36, height * .04) * Math.sin(Math.PI * u)
        const y = height * .88 + line * 4 + Math.sin(u * Math.PI * 3 + time * .18 + line * .13) * amplitude
        if (!x) context.moveTo(x, y); else context.lineTo(x, y)
      }
      context.strokeStyle = palette['fx-wave']; context.globalAlpha = .06 + line / profile.waves * .11
      context.stroke()
    }

    for (const [i, dot] of (light ? [] : dots).entries()) {
      const x = dot.x * width + Math.sin(time * .12 + i) * 7
      const y = ((dot.y * height - time * dot.speed) % height + height) % height
      context.fillStyle = palette['fx-dot']; context.globalAlpha = .12 + (1 + Math.sin(time * .4 + i)) * .13
      context.fillRect(x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2)
    }

    context.globalAlpha = 1
    if (profile.panels && !light) {
      context.font = '8px "JetBrains Mono", monospace'
      context.textBaseline = 'top'
      for (let side = 0; side < 2; side++) {
        const x = side ? width - 182 : 56, y = height * .41
        context.fillStyle = palette['fx-panel']; context.fillRect(x, y, 126, 64)
        context.strokeStyle = palette['fx-panel-line']; context.lineWidth = .6
        context.strokeRect(x, y, 126, 64)
        context.fillStyle = palette['fx-panel-label']; context.fillText(side ? ru.effects.grid : ru.effects.contour, x + 9, y + 10)
        context.fillStyle = palette['fx-bits']
        for (let row = 0; row < 3; row++) {
          const bits = Array.from({ length: 14 }, (_, i) => ((i * 17 + row * 31 + side * 7 + Math.floor(time / 1.8)) % 3 ? '0' : '1')).join(' ')
          context.fillText(bits, x + 9, y + 25 + row * 10, 108)
        }
      }
    }

    // Убираем декоративный шум под заголовком, поиском и шапкой.
    context.save(); context.globalCompositeOperation = 'destination-out'
    context.fillStyle = palette['fx-mask']
    for (const rect of keepClear) context.fillRect(rect.x - 10, rect.y - 8, rect.width + 20, rect.height + 16)
    context.restore()
    context.save(); context.globalCompositeOperation = 'destination-over'
    context.fillStyle = vignette; context.fillRect(0, 0, width, height)
    context.restore()

    if (surface.revision !== revision) {
      revision = surface.revision
      const path = surface.selected || surface.country
      mask = path ? new Path2D(path) : null
    }
    if (mask) {
      context.save(); context.clip(mask)
      context.fillStyle = palette['fx-scanline']
      for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 1)
      if (!reduced) {
        const scan = (time * 15) % (height + 90) - 45
        const glow = context.createLinearGradient(0, scan - 25, 0, scan + 25)
        glow.addColorStop(0, palette['fx-scan-clear']); glow.addColorStop(.5, palette['fx-scan']); glow.addColorStop(1, palette['fx-scan-clear'])
        context.fillStyle = glow; context.fillRect(0, scan - 25, width, 50)
      }
      context.restore()
    }

    if (!reduced) drawPulse(context, surface, time, profile.pulseSteps, palette, false)
  }
}
