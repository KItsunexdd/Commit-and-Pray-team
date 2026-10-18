import { useEffect } from 'react'
import { performanceGuard } from './quality'

export function useFrameRateGuard(enabled: boolean, onSlow: () => void) {
  useEffect(() => {
    if (!enabled) return
    const guard = performanceGuard()
    let frame = 0, timer = 0
    // Измеряем соседние кадры, а между парами даём странице уснуть.
    // Пауза таймера не входит в измеренный интервал rAF.
    const sample = () => {
      frame = requestAnimationFrame(first => {
        frame = requestAnimationFrame(second => {
          if (guard.sample(second, second - first)) { onSlow(); return }
          timer = window.setTimeout(sample, 200)
        })
      })
    }
    const visibility = () => {
      cancelAnimationFrame(frame); clearTimeout(timer); guard.reset()
      if (!document.hidden) sample()
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [enabled, onSlow])
}
