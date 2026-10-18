import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockParse } from '../api/mocks'
import { ApiError } from '../api/errors'
import type { ParseResponse } from '../api/types'
import { ru } from '../i18n/ru'
import { createParseSession } from './parse-session'

const response = (raw: string) => mockParse({ records: [{ id: 'address-0', raw_address: raw }] })
function deferred() {
  let resolve!: (response: ParseResponse) => void
  let reject!: (error: Error) => void
  const promise = new Promise<ParseResponse>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => vi.useRealTimers())

describe('запрос разбора адреса', () => {
  it('остановка воспроизведения сохраняет уже полученный результат и ошибку', async () => {
    const client = { parse: vi.fn().mockResolvedValueOnce(response(ru.examples[0])).mockRejectedValueOnce(new ApiError('serverError')) }
    const session = createParseSession(client)
    await session.parse(ru.examples[0])
    session.cancelPending()
    expect(session.getSnapshot().status).toBe('ready')
    await session.parse(ru.examples[1])
    session.cancelPending()
    expect(session.getSnapshot().status).toBe('error')
  })
  it('передаёт исходный текст без изменений и показывает загрузку до ответа', async () => {
    const pending = deferred()
    const client = { parse: vi.fn().mockReturnValue(pending.promise) }
    const session = createParseSession(client)
    const raw = `  ${ru.examples[0]}\n`
    const task = session.parse(raw)
    expect(session.getSnapshot()).toEqual({ status: 'loading', raw })
    expect(client.parse.mock.calls[0]?.[0]).toEqual([{ id: 'address-0', raw_address: raw }])
    pending.resolve(response(raw))
    await task
    expect(session.getSnapshot()).toMatchObject({ status: 'ready', raw, item: { result: { raw_address: raw, city: 'Алматы' } } })
  })
  it('игнорирует старый ответ даже если сервер не поддержал отмену', async () => {
    const a = deferred(), b = deferred()
    const client = { parse: vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise) }
    const session = createParseSession(client)
    const first = session.parse(ru.examples[0])
    const signal = client.parse.mock.calls[0]?.[1] as AbortSignal
    const second = session.parse(ru.examples[3])
    expect(signal.aborted).toBe(true)
    b.resolve(response(ru.examples[3])); await second
    a.resolve(response(ru.examples[0])); await first
    expect(session.getSnapshot()).toMatchObject({ status: 'ready', item: { result: { city: 'Актобе' } } })
  })
  it('после очистки не возвращает результат или ошибку отменённого запроса', async () => {
    const pending = deferred()
    const session = createParseSession({ parse: () => pending.promise })
    const task = session.parse('адрес')
    session.cancel()
    pending.reject(new Error('cancelled'))
    await task
    expect(session.getSnapshot()).toEqual({ status: 'idle' })
  })
  it('показывает ошибку и позволяет повторить тот же адрес', async () => {
    const client = { parse: vi.fn().mockRejectedValueOnce(new ApiError('networkError')).mockResolvedValueOnce(response(ru.examples[0])) }
    const session = createParseSession(client)
    await session.parse(ru.examples[0])
    expect(session.getSnapshot()).toEqual({ status: 'error', raw: ru.examples[0], message: ru.api.networkError })
    await session.parse(ru.examples[0])
    expect(session.getSnapshot().status).toBe('ready')
  })
  it('ограничивает время ожидания и игнорирует поздний ответ', async () => {
    vi.useFakeTimers()
    const pending = deferred()
    const session = createParseSession({ parse: () => pending.promise }, 1000)
    const task = session.parse('адрес')
    await vi.advanceTimersByTimeAsync(1000)
    expect(session.getSnapshot()).toEqual({ status: 'error', raw: 'адрес', message: ru.result.timeout })
    pending.resolve(response('адрес')); await task
    expect(session.getSnapshot().status).toBe('error')
  })
  it('не отправляет пустую строку и освобождает подписку', async () => {
    const client = { parse: vi.fn().mockResolvedValue(response('адрес')) }
    const session = createParseSession(client)
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)
    await session.parse('  ')
    expect(client.parse).not.toHaveBeenCalled()
    unsubscribe(); listener.mockClear()
    await session.parse('адрес')
    expect(listener).not.toHaveBeenCalled()
  })
})
