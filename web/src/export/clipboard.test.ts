import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

afterEach(() => vi.unstubAllGlobals())
function setup(writeText?: (text: string) => Promise<void>, legacy = true) {
  class Element { focus = vi.fn() }
  const focused = new Element(), range = {}, selection = {
    rangeCount: 1, getRangeAt: () => ({ cloneRange: () => range }), removeAllRanges: vi.fn(), addRange: vi.fn(),
  }
  const textarea = { ...new Element(), value: '', readOnly: false, tabIndex: 0, setAttribute: vi.fn(), style: {}, select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() }
  const append = vi.fn(), createElement = vi.fn(() => textarea)
  const execCommand = vi.fn(() => {
    expect(textarea.value).toBe('{"city":"Өскемен"}')
    expect(textarea.readOnly).toBe(true)
    expect(textarea.select).toHaveBeenCalled()
    return legacy
  })
  vi.stubGlobal('HTMLElement', Element)
  vi.stubGlobal('navigator', { clipboard: writeText ? { writeText } : undefined })
  vi.stubGlobal('document', { activeElement: focused, getSelection: () => selection, body: { append }, createElement, execCommand })
  return { textarea, focused, selection, range, createElement, execCommand }
}
const text = '{"city":"Өскемен"}'
describe('копирование JSON', () => {
  it('при успешном Clipboard API не создаёт запасное поле', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined), { createElement, execCommand } = setup(writeText)
    await copyText(text)
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
    expect(createElement).not.toHaveBeenCalled(); expect(execCommand).not.toHaveBeenCalled()
  })
  it.each(['нет API', 'отказ API'])('копирует через textarea, если %s, затем восстанавливает фокус и выделение', async mode => {
    const writeText = mode === 'отказ API' ? vi.fn().mockRejectedValue(new Error('Denied')) : undefined
    const { textarea, focused, selection, range, execCommand } = setup(writeText)
    await expect(copyText(text)).resolves.toBeUndefined()
    expect(execCommand).toHaveBeenCalledExactlyOnceWith('copy')
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(0, text.length)
    expect(textarea.remove).toHaveBeenCalledOnce()
    expect(focused.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(selection.addRange).toHaveBeenCalledWith(range)
  })
  it.each(['false', 'throw'])('сообщает об ошибке и убирает поле, если оба способа отказали (%s)', async mode => {
    const { textarea, focused, execCommand } = setup(vi.fn().mockRejectedValue(new Error('Denied')), false)
    if (mode === 'throw') execCommand.mockImplementation(() => { throw new Error('Copy disabled') })
    await expect(copyText(text)).rejects.toThrow()
    expect(textarea.remove).toHaveBeenCalledOnce(); expect(focused.focus).toHaveBeenCalledOnce()
  })
})
