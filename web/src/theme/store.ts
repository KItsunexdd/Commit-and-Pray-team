import { palettes } from './palette'
import type { Theme } from './palette'
import { saveTheme } from './preference'

export const currentTheme = (): Theme => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
export const colors = () => palettes[currentTheme()]
export function subscribeTheme(listener: () => void) {
  window.addEventListener('themechange', listener)
  return () => window.removeEventListener('themechange', listener)
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', palettes[theme].bg)
  try { saveTheme(theme, localStorage) } catch { /* Некоторые браузеры блокируют сам доступ к localStorage. */ }
  window.dispatchEvent(new Event('themechange'))
}
