import { describe, expect, it, vi } from 'vitest'
import { loadTheme, resolveTheme, saveTheme, themeBootstrap, themeKey } from './preference'
import { palettes, themeCss } from './palette'

describe('тема интерфейса', () => {
  it('по умолчанию светлая; параметр имеет приоритет перед сохранённым выбором', () => {
    expect(resolveTheme('', null)).toBe('light')
    expect(resolveTheme('', 'dark')).toBe('dark')
    expect(resolveTheme('?theme=light', 'dark')).toBe('light')
    expect(resolveTheme('?theme=dark', 'light')).toBe('dark')
    expect(resolveTheme('?theme=invalid', 'invalid')).toBe('light')
  })
  it('сохраняет выбор, а при запрете хранилища работает без ошибок', () => {
    const storage = { getItem: vi.fn(() => 'dark'), setItem: vi.fn() }
    expect(loadTheme('', storage)).toBe('dark')
    saveTheme('light', storage)
    expect(storage.setItem).toHaveBeenCalledWith(themeKey, 'light')
    const blocked = { getItem: () => { throw Error() }, setItem: () => { throw Error() } }
    expect(loadTheme('?theme=dark', blocked)).toBe('dark')
    expect(loadTheme('', blocked)).toBe('light')
    expect(() => saveTheme('dark', blocked)).not.toThrow()
  })
  it('скрипт до рендера ставит атрибут, color-scheme и метаданные, даже без хранилища', () => {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }, meta = { content: '' }
    const storage = { getItem() { throw Error() } }
    new Function('document', 'location', 'localStorage', 'getComputedStyle', themeBootstrap())(
      { documentElement: root, querySelector: () => meta }, { search: '?theme=dark' }, storage,
      () => ({ getPropertyValue: () => palettes.dark.bg }))
    expect(root.dataset.theme).toBe('dark'); expect(root.style.colorScheme).toBe('dark'); expect(meta.content).toBe(palettes.dark.bg)
    expect(themeCss()).toContain('--bg:#ffffff')
  })
  it('контраст текста и полей в светлой теме соответствует AA', () => {
    const lum = (hex: string) => {
      const rgb = hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!
    }
    for (const [key, value] of Object.entries(palettes.light)) if (['text', 'muted', 'neon'].includes(key) || key.startsWith('field-')) {
      expect((lum(palettes.light['bg-elev']) + .05) / (lum(value) + .05), key).toBeGreaterThanOrEqual(4.5)
    }
    expect(1.05 / (lum(palettes.light.action) + .05)).toBeGreaterThanOrEqual(4.5)
  })
})
