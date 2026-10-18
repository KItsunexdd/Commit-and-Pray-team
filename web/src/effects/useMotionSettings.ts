import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const snapshot = () => `${document.hidden}:${matchMedia(query).matches}`
function subscribe(listener: () => void) {
  const media = matchMedia(query)
  media.addEventListener('change', listener)
  document.addEventListener('visibilitychange', listener)
  return () => { media.removeEventListener('change', listener); document.removeEventListener('visibilitychange', listener) }
}

export function useMotionSettings(paused: boolean) {
  const [hidden, reduced] = useSyncExternalStore(subscribe, snapshot).split(':').map((value) => value === 'true')
  return { hidden: !!hidden, reduced: !!reduced, running: !hidden && !reduced && !paused }
}
