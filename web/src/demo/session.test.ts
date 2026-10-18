import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoSession, demoAddresses } from './session'
import { createParseSession } from '../result/parse-session'
import { createApiClient } from '../api/client'
import { mockParse } from '../api/mocks'
import type { ParseState } from '../result/parse-session'
import type { ParseResponse } from '../api/types'
import { ru } from '../i18n/ru'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const setup = () => {
  const actions = { prepare: vi.fn(), type: vi.fn(), parse: vi.fn(), cancelPending: vi.fn(), overview: vi.fn() }
  const demo = createDemoSession(actions)
  demo.mapReady(true)
  return { actions, demo }
}
const ready = (index: number, revision = index + 1): ParseState => ({ status: 'ready', raw: demoAddresses[index]!, revision,
  item: mockParse({ records: [{ id: 'address-0', raw_address: demoAddresses[index]! }] }).items[0]! })

describe('демо адресов', () => {
  it('до готовности карты не печатает и не отправляет адрес; ожидание можно остановить или поставить на паузу', () => {
    const { demo, actions } = setup()
    demo.mapReady(false); demo.start()
    vi.advanceTimersByTime(30_000)
    expect(demo.getSnapshot().phase).toBe('preparing')
    expect(actions.type).not.toHaveBeenCalled()
    expect(actions.parse).not.toHaveBeenCalled()
    demo.togglePause(); demo.mapReady(true)
    vi.advanceTimersByTime(5000)
    expect(actions.type).not.toHaveBeenCalled()
    demo.togglePause(); vi.advanceTimersByTime(25)
    expect(actions.type).toHaveBeenCalledOnce()
    demo.mapReady(false); demo.start(); demo.stop(); demo.mapReady(true)
    expect(demo.getSnapshot().phase).toBe('idle')
  })
  it('полностью проходит на явных моках: все пять фикстур содержат поля, запросов к серверу нет', async () => {
    const request = vi.fn<typeof fetch>()
    const parser = createParseSession(createApiClient({ basePath: '/api', useMocks: true }, request))
    const results: string[] = []
    const demo = createDemoSession({ prepare: parser.cancel, type: vi.fn(), parse: raw => { void parser.parse(raw) },
      cancelPending: parser.cancelPending, overview: () => { parser.cancel(); demo.viewReady(-1) } })
    parser.subscribe(() => {
      const state = parser.getSnapshot()
      demo.parsed(state)
      if (state.status === 'ready') {
        expect(state.item.result.house).toBeTruthy()
        expect(state.item.explain?.spans?.length).toBeGreaterThan(0)
        expect(Object.keys(state.item.result)).toHaveLength(14)
        results.push(state.raw)
        demo.viewReady(state.revision)
      }
    })
    demo.mapReady(true); demo.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(results).toEqual(demoAddresses)
    expect(demo.getSnapshot().phase).toBe('done')
    expect(request).not.toHaveBeenCalled()
  })
  it('без моков при недоступном сервере останавливается на первой строке с понятной ошибкой', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    const parser = createParseSession(createApiClient({ basePath: '/api', useMocks: false }, request))
    const demo = createDemoSession({ prepare: parser.cancel, type: vi.fn(), parse: raw => { void parser.parse(raw) },
      cancelPending: parser.cancelPending, overview: vi.fn() })
    parser.subscribe(() => demo.parsed(parser.getSnapshot()))
    demo.mapReady(true); demo.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(request).toHaveBeenCalledOnce()
    expect(parser.getSnapshot()).toEqual({ status: 'error', raw: demoAddresses[0], message: ru.api.networkError })
    expect(demo.getSnapshot()).toMatchObject({ phase: 'idle', index: 0 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('печатает точные пять строк по 25 мс, ждёт подлёт и четыре секунды, затем возвращается к стране', async () => {
    const { demo, actions } = setup()
    demo.mapReady(true); demo.start()
    for (let index = 0; index < demoAddresses.length; index++) {
      const raw = demoAddresses[index]!
      await vi.advanceTimersByTimeAsync(raw.length * 25 - 1)
      expect(actions.parse).toHaveBeenCalledTimes(index)
      expect(actions.type).toHaveBeenLastCalledWith(raw.slice(0, -1))
      await vi.advanceTimersByTimeAsync(1)
      expect(actions.parse).toHaveBeenLastCalledWith(raw)
      demo.parsed(ready(index))
      await vi.advanceTimersByTimeAsync(10_000)
      expect(demo.getSnapshot().phase).toBe('flying')
      demo.viewReady(index + 1)
      await vi.advanceTimersByTimeAsync(3999)
      expect(demo.getSnapshot()).toMatchObject({ phase: 'holding', index })
      await vi.advanceTimersByTimeAsync(1)
    }
    expect(actions.parse.mock.calls.flat()).toEqual(demoAddresses)
    expect(actions.overview).toHaveBeenCalledOnce()
    expect(demo.getSnapshot().phase).toBe('returning')
    demo.viewReady(-1)
    expect(demo.getSnapshot().phase).toBe('done')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(actions.parse).toHaveBeenCalledTimes(5)
  })
  it('пауза сохраняет место в строке и остаток четырёхсекундного показа', async () => {
    const { demo, actions } = setup()
    demo.mapReady(true); demo.start()
    await vi.advanceTimersByTimeAsync(60)
    demo.togglePause()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(actions.type).toHaveBeenCalledTimes(2)
    demo.togglePause()
    await vi.advanceTimersByTimeAsync(14)
    expect(actions.type).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(actions.type).toHaveBeenLastCalledWith(demoAddresses[0].slice(0, 3))
    await vi.advanceTimersByTimeAsync(demoAddresses[0].length * 25)
    demo.parsed(ready(0)); demo.viewReady(1)
    await vi.advanceTimersByTimeAsync(1500)
    demo.togglePause()
    await vi.advanceTimersByTimeAsync(20_000)
    demo.togglePause()
    await vi.advanceTimersByTimeAsync(2499)
    expect(demo.getSnapshot().index).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(demo.getSnapshot()).toMatchObject({ phase: 'typing', index: 1 })
  })
  it('при ответе на паузе сохраняет результат и не начинает отсчёт до продолжения', async () => {
    const { demo } = setup()
    demo.mapReady(true); demo.start()
    await vi.advanceTimersByTimeAsync(2000)
    demo.togglePause(); demo.parsed(ready(0)); demo.viewReady(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(demo.getSnapshot()).toMatchObject({ phase: 'flying', paused: true })
    demo.togglePause()
    expect(demo.getSnapshot().phase).toBe('holding')
  })
  it('учитывает завершение карты до уведомления о результате, но игнорирует чужой подлёт', async () => {
    const { demo } = setup()
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(2000)
    demo.viewReady(42); demo.parsed(ready(0, 43))
    expect(demo.getSnapshot().phase).toBe('flying')
    demo.viewReady(43)
    expect(demo.getSnapshot().phase).toBe('holding')
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(2000)
    demo.viewReady(50); demo.parsed(ready(0, 50))
    expect(demo.getSnapshot().phase).toBe('holding')
  })
  it('останавливается на ошибке, не очищая штатное сообщение и не переходя к следующему адресу', async () => {
    const { demo, actions } = setup()
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(2000)
    actions.cancelPending.mockClear()
    demo.parsed({ status: 'error', raw: demoAddresses[0], message: 'Ошибка сервера' })
    expect(demo.getSnapshot().phase).toBe('idle')
    expect(actions.cancelPending).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(actions.parse).toHaveBeenCalledOnce()
  })
  it('остановка и размонтирование удаляют таймеры и отменяют ожидающий запрос', async () => {
    const { demo, actions } = setup()
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(100)
    demo.stop()
    actions.type.mockClear(); actions.parse.mockClear()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(actions.type).not.toHaveBeenCalled(); expect(actions.parse).not.toHaveBeenCalled()
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(2000)
    demo.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(actions.cancelPending).toHaveBeenCalled()
  })
  it('идёт через обычную сессию разбора и HTTP-клиент; поздний ответ после Стоп не возвращается', async () => {
    let respond!: (response: Response) => void
    const request = vi.fn<typeof fetch>(() => new Promise(resolve => { respond = resolve }))
    const parser = createParseSession(createApiClient({ basePath: '/api', useMocks: false }, request))
    const demo = createDemoSession({ prepare: parser.cancel, type: vi.fn(), parse: raw => { void parser.parse(raw) },
      cancelPending: parser.cancelPending, overview: parser.cancel })
    parser.subscribe(() => demo.parsed(parser.getSnapshot()))
    demo.mapReady(true); demo.start(); await vi.advanceTimersByTimeAsync(2000)
    expect(request).toHaveBeenCalledWith('/api/ui/parse', expect.objectContaining({ method: 'POST',
      body: JSON.stringify({ records: [{ id: 'address-0', raw_address: demoAddresses[0] }] }) }))
    const signal = request.mock.calls[0]![1]!.signal!
    demo.stop()
    expect(signal.aborted).toBe(true)
    respond(new Response(JSON.stringify(mockParse({ records: [{ id: 'address-0', raw_address: demoAddresses[0] }] }) satisfies ParseResponse)))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(parser.getSnapshot().status).toBe('idle')
    expect(demo.getSnapshot().phase).toBe('idle')
    expect(request).toHaveBeenCalledOnce()
  })
})
