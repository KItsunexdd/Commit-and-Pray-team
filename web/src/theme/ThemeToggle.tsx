import { useSyncExternalStore } from 'react'
import { currentTheme, setTheme, subscribeTheme } from './store'
import './theme.css'

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme)
  return <button className="theme-toggle" type="button" data-demo-control="" aria-label="Тёмная тема" aria-pressed={theme === 'dark'}
    title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{theme === 'dark'
      ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
      : <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />}</svg>
  </button>
}
