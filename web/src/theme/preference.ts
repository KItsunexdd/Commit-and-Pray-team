import type { Theme } from './palette.ts'

export const themeKey = 'jana-theme'
export function resolveTheme(search: string, saved: string | null): Theme {
  const requested = new URLSearchParams(search).get('theme')
  if (requested === 'light' || requested === 'dark') return requested
  return saved === 'dark' ? 'dark' : 'light'
}
export function loadTheme(search: string, storage: Pick<Storage, 'getItem'>): Theme {
  let saved: string | null = null
  try { saved = storage.getItem(themeKey) } catch { /* Хранилище может быть недоступно. */ }
  return resolveTheme(search, saved)
}
export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'>) {
  try { storage.setItem(themeKey, theme) } catch { /* Тема продолжает работать в памяти. */ }
}

// Встраивается в head до загрузки приложения; не обращается к сети.
export function themeBootstrap() {
  return `(()=>{let saved=null;try{saved=localStorage.getItem(${JSON.stringify(themeKey)})}catch{};const theme=(${resolveTheme.toString()})(location.search,saved);document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()})()`
}
