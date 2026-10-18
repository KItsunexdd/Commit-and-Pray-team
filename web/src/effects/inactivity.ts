const activityEvents = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'input', 'wheel'] as const
const idleDelay = 20_000

export function observeInactivity(target: EventTarget, onChange: (idle: boolean) => void) {
  let lastActivity = performance.now()
  let idle = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const check = () => {
    const remaining = idleDelay - (performance.now() - lastActivity)
    if (remaining > 0) timer = setTimeout(check, remaining)
    else { timer = null; idle = true; onChange(true) }
  }
  const activity = () => {
    lastActivity = performance.now()
    if (!idle) return
    idle = false
    onChange(false)
    timer = setTimeout(check, idleDelay)
  }
  // Частые движения указателя меняют только время, не создавая таймер на каждое событие.
  for (const event of activityEvents) target.addEventListener(event, activity, { capture: true, passive: true })
  timer = setTimeout(check, idleDelay)
  return () => {
    if (timer !== null) clearTimeout(timer)
    for (const event of activityEvents) target.removeEventListener(event, activity, { capture: true })
  }
}
