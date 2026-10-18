import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createApiClient } from './client'
import { fetchInfo, readInfo, sourceLink } from './info'
import { interfaceCounts } from '../about/model'
import type { RegionInfo } from '../map/data'
import type { CityInfo } from '../search/places'

// Контрактный образец для проверки отображения, не данные о качестве сервиса.
const info = { version: 'test', gazetteer: { sources: [{ name: 'OpenStreetMap', url: 'https://www.openstreetmap.org', date: '2026-10-17' }],
  counts: { provinces: 17, cities: 87, districts: 213, streets: 41000, living_areas: 950 } },
  metrics: [{ version: 'sample', score: 0, address: .72, details: .123456789, reference: 1 }] }
afterEach(() => vi.useRealTimers())

describe('сведения о справочнике', () => {
  it.each([false, true])('запрашивает сведения сервера даже при useMocks=%s, не меняет нули и точность метрик', async useMocks => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(info))
    const result = await createApiClient({ basePath: '/v1/api', useMocks }, request).info()
    expect(request).toHaveBeenCalledWith('/v1/api/info', expect.objectContaining({
      credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal),
    }))
    expect(result.metrics).toEqual(info.metrics)
    expect(result.gazetteer.counts).toEqual(info.gazetteer.counts)
    expect(result.gazetteer.sources[0]).toEqual({ ...info.gazetteer.sources[0], url: 'https://www.openstreetmap.org/' })
  })
  it.each([undefined, null, []])('не подставляет показатели при отсутствии метрик: %j', metrics => {
    expect(readInfo({ ...info, metrics }).metrics).toEqual([])
  })
  it('сохраняет пустые списки и нулевые размеры, не заменяет их локальными', () => {
    expect(readInfo({ ...info, gazetteer: { sources: [], counts: { cities: 0 } } }).gazetteer).toEqual({ sources: [], counts: { cities: 0 } })
  })
  it.each([null, {}, { ...info, gazetteer: { sources: [], counts: { cities: '87' } } },
    { ...info, gazetteer: { sources: [], counts: { cities: -1 } } }, { ...info, metrics: [{ version: 'v1', score: '0' }] },
    { ...info, metrics: [{ ...info.metrics[0], score: Infinity }] }])('отклоняет некорректные сведения: %j', value => {
    expect(() => readInfo(value)).toThrow()
  })
  it.each(['javascript:alert(1)', 'data:text/html,test', '//evil.test', 'https://user:secret@example.com', 'invalid'])('не делает ссылкой адрес источника %s', value => {
    expect(sourceLink(value)).toBeNull()
    expect(readInfo({ ...info, gazetteer: { ...info.gazetteer, sources: [{ name: 'Источник', url: value }] } }).gazetteer.sources)
      .toEqual([{ name: 'Источник', url: null, date: null }])
  })
  it('передаёт сетевую ошибку, HTTP-ошибку и неверный JSON без подставных сведений', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response('<html>'))
    await expect(fetchInfo('/api', undefined, request)).rejects.toMatchObject({ code: 'networkError' })
    await expect(fetchInfo('/api', undefined, request)).rejects.toMatchObject({ code: 'serverError', status: 503 })
    await expect(fetchInfo('/api', undefined, request)).rejects.toMatchObject({ code: 'invalidResponse' })
  })
  it('ограничивает ожидание сервера и освобождает таймер', async () => {
    vi.useFakeTimers()
    const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const pending = expect(fetchInfo('/api', undefined, request, 8000)).rejects.toMatchObject({ code: 'networkError' })
    await vi.advanceTimersByTimeAsync(8000)
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })
  it('сохраняет отмену и отклоняет поздний ответ после ухода с экрана', async () => {
    const controller = new AbortController()
    let resolve!: (response: Response) => void
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = expect(fetchInfo('/api', controller.signal, request)).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    resolve(Response.json(info))
    await pending
    const unused = vi.fn<typeof fetch>()
    await expect(fetchInfo('/api', controller.signal, unused)).rejects.toMatchObject({ name: 'AbortError' })
    expect(unused).not.toHaveBeenCalled()
  })
  it('считает локальные записи из загруженных файлов, включая города-регионы, без встроенных чисел', () => {
    const regions = JSON.parse(readFileSync('../data/geo/kz-regions.json', 'utf8')) as RegionInfo[]
    const cities = JSON.parse(readFileSync('../data/geo/kz-cities.json', 'utf8')) as CityInfo[]
    expect(interfaceCounts({ regions, cities })).toEqual({ regions: regions.length, cities: cities.length })
    expect(interfaceCounts({ regions: regions.slice(0, 3), cities: cities.slice(0, 7) })).toEqual({ regions: 3, cities: 7 })
    expect(interfaceCounts({ regions: [], cities: [] })).toEqual({ regions: 0, cities: 0 })
  })
})
