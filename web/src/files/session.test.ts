import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { mockParse } from '../api/mocks'
import type { AddressRecord, ParseResponse } from '../api/types'
import { ru } from '../i18n/ru'
import { createFileSession } from './session'

const records = ru.examples.map((raw_address) => ({ id: 'duplicate', raw_address }))
const source = { name: 'input.json', records }
const response = (records: readonly AddressRecord[]) => mockParse({ records: [...records] })
function deferred() {
  let resolve!: (value: ParseResponse) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ParseResponse>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => vi.useRealTimers())

describe('пакетная проверка файла', () => {
  it('разбирает порциями и сохраняет порядок, включая одинаковые ID', async () => {
    const parse = vi.fn(async (records: readonly AddressRecord[]) => response(records))
    const session = createFileSession({ parse }, 2)
    session.load(source); await session.run()
    expect(parse.mock.calls.map(([records]) => records.length)).toEqual([2, 2, 1])
    expect(session.getSnapshot().status).toBe('done')
    expect(session.getSnapshot().rows.map(({ item }) => item.result.raw_address)).toEqual(records.map((record) => record.raw_address))
  })
  it('останавливает текущую порцию и продолжает с последней завершённой', async () => {
    const pending = deferred()
    const parse = vi.fn().mockResolvedValueOnce(response(records.slice(0, 2))).mockReturnValueOnce(pending.promise)
      .mockImplementation(async (records: AddressRecord[]) => response(records))
    const session = createFileSession({ parse }, 2)
    session.load(source)
    const first = session.run()
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2))
    session.pause()
    expect((parse.mock.calls[1]![1] as AbortSignal).aborted).toBe(true)
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', rows: expect.any(Array) })
    pending.resolve(response(records.slice(2, 4))); await first
    expect(session.getSnapshot().rows).toHaveLength(2)
    await session.run()
    expect(parse.mock.calls[2]![0]).toEqual(records.slice(2, 4))
    expect(session.getSnapshot().rows).toHaveLength(5)
  })
  it('не заменяет новый файл запоздавшим ответом старого', async () => {
    const pending = deferred()
    const session = createFileSession({ parse: () => pending.promise })
    session.load(source); const running = session.run()
    const next = { name: 'next.json', records: [records[3]!] }
    session.load(next)
    pending.resolve(response(records)); await running
    expect(session.getSnapshot()).toMatchObject({ source: next, rows: [], status: 'loaded' })
  })
  it('сохраняет готовые записи и ручные правки при ошибке и повторе', async () => {
    const pending = deferred()
    const parse = vi.fn().mockResolvedValueOnce(response(records.slice(0, 2))).mockReturnValueOnce(pending.promise)
      .mockImplementation(async (records: AddressRecord[]) => response(records))
    const session = createFileSession({ parse }, 2)
    session.load(source); const running = session.run()
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2))
    session.edit(1, { ...session.getSnapshot().rows[1]!.item.result, house: '55/7' })
    pending.reject(new ApiError('serverError')); await running
    expect(session.getSnapshot().status).toBe('error')
    await session.run()
    expect(session.getSnapshot().rows[0]!.item.result.house).toBe('59')
    expect(session.getSnapshot().rows[1]!.item.result.house).toBe('55/7')
    expect(session.getSnapshot().rows[1]!.original.house).toBe('55/6')
    expect(session.getSnapshot().status).toBe('done')
  })
  it('тайм-аут прекращает ожидание, поздний ответ ничего не меняет', async () => {
    vi.useFakeTimers()
    const pending = deferred()
    const session = createFileSession({ parse: () => pending.promise }, 50, 1000)
    session.load(source); const running = session.run()
    await vi.advanceTimersByTimeAsync(1000)
    expect(session.getSnapshot()).toMatchObject({ status: 'error', error: ru.files.timeout })
    pending.resolve(response(records)); await running
    expect(session.getSnapshot().rows).toHaveLength(0)
  })
  it('отклоняет неполный ответ и перестановку записей', async () => {
    for (const invalid of [response(records.slice(0, 1)), response([...records].reverse())]) {
      const session = createFileSession({ parse: async () => invalid })
      session.load(source); await session.run()
      expect(session.getSnapshot()).toMatchObject({ status: 'error', error: ru.api.invalidResponse, rows: [] })
    }
  })
})
