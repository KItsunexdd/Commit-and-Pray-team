export interface DeviceHints { hardwareConcurrency?: number; deviceMemory?: number }

export function lowPowerDevice(hints: DeviceHints): boolean {
  return (hints.hardwareConcurrency ?? 8) <= 4 || (hints.deviceMemory ?? 8) <= 4
}

export function effectProfile(width: number, height: number, dpr: number, economy: boolean, reduced: boolean) {
  const mobile = width < 640
  const area = Math.max(0, width * height)
  return {
    fps: 15,
    ratio: Math.min(Math.max(1, dpr), 1),
    particles: reduced ? 0 : Math.min(economy ? 10 : mobile ? 22 : 56, Math.floor(area / (economy ? 40_000 : 20_000))),
    waves: reduced ? 4 : economy ? 5 : mobile ? 7 : 14,
    panels: !mobile && !economy && !reduced && width >= 1100,
    pulseSteps: economy ? 20 : mobile ? 32 : 48,
  }
}

// Три последовательных секундных окна с большинством кадров длиннее 50 мс.
// Короткая задача canvas не означает, что остальная страница успевает рисоваться.
export function performanceGuard() {
  let start: number | null = null
  let windowStart: number | null = null
  let samples = 0, slowFrames = 0, slowWindows = 0
  return {
    reset() { start = null; windowStart = null; samples = 0; slowFrames = 0; slowWindows = 0 },
    sample(now: number, gap: number): boolean {
      start ??= now
      if (now - start < 1500) return false
      windowStart ??= now
      samples++; if (gap > 50) slowFrames++
      if (now - windowStart < 1000) return false
      slowWindows = samples >= 2 && slowFrames / samples >= .7 ? slowWindows + 1 : 0
      windowStart = now; samples = 0; slowFrames = 0
      return slowWindows >= 3
    },
  }
}
