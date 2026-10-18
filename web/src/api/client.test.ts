import { describe, expect, it, vi } from 'vitest'
import { ru } from '../i18n/ru'
import { createApiClient } from './client'
import { readApiConfig } from './config'
import { mockParse } from './mocks'
import { addressFields } from './types'
import type { AddressRecord } from './types'

const records: AddressRecord[] = [
  { id: 'same-id', raw_address: ru.examples[0] },
  { id: 'same-id', raw_address: ru.examples[3] },
]

function liveClient(body: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }))
  return { client: createApiClient({ basePath: '/api', useMocks: false }, fetcher), fetcher }
}

describe('конфигурация API', () => {
  it('использует реальный API по умолчанию и явный флаг моков', () => {
    expect(readApiConfig({})).toEqual({ basePath: '/api', useMocks: false })
    expect(readApiConfig({ VITE_USE_MOCKS: 'true', VITE_API_BASE: '/v1/api/' }))
      .toEqual({ basePath: '/v1/api', useMocks: true })
    expect(() => readApiConfig({ VITE_USE_MOCKS: 'yes' })).toThrow(ru.api.invalidMockFlag)
  })

  it.each(['https://example.com/api', '//example.com', '/\\example.com', '/api?url=x', '/', '/api/../other'])(
    'отклоняет нелокальный или некорректный путь %s', (basePath) => {
      expect(() => readApiConfig({ VITE_API_BASE: basePath })).toThrow(ru.api.invalidBase)
    },
  )
})

describe('демонстрационные ответы', () => {
  it('не обращается к сети и сохраняет две разные записи с одинаковым id', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createApiClient({ basePath: '/api', useMocks: true }, fetcher)
    const response = await client.parse(records)

    expect(fetcher).not.toHaveBeenCalled()
    expect(response.items.map(({ result }) => [result.id, result.raw_address, result.city]))
      .toEqual([
        ['same-id', ru.examples[0], 'Алматы'],
        ['same-id', ru.examples[3], 'Актобе'],
      ])
    for (const { result } of response.items) expect(Object.keys(result)).toHaveLength(14)
    expect(records).toEqual([
      { id: 'same-id', raw_address: ru.examples[0] },
      { id: 'same-id', raw_address: ru.examples[3] },
    ])
  })

  it('оставляет неизвестный адрес без выдуманных значений', async () => {
    const client = createApiClient({ basePath: '/api', useMocks: true })
    const raw = '  совершенно неизвестный адрес 🏠  '
    const { items } = await client.parse([{ id: '', raw_address: raw }])
    expect(items[0]?.result.raw_address).toBe(raw)
    expect(items[0]?.result.confidence).toBe(0)
    expect(items[0]?.explain).toBeNull()
    for (const field of addressFields) expect(items[0]?.result[field]).toBeNull()
  })

  it('создаёт позиции подсветки по исходной строке, включая ведущие пробелы', () => {
    const response = mockParse({ records: ru.examples.map((raw, index) => ({ id: `${index}`, raw_address: `  ${raw}  ` })) })
    for (const { result, explain } of response.items) {
      expect(explain?.spans?.length).toBeGreaterThan(0)
      for (const span of explain?.spans ?? []) {
        expect(result.raw_address.slice(span.start, span.end).toLocaleLowerCase('ru'))
          .toBe(result[span.field]?.toLocaleLowerCase('ru') === 'микрорайон'
            && result.raw_address.slice(span.start, span.end) === 'Мкр'
            ? 'мкр' : result[span.field]?.toLocaleLowerCase('ru'))
      }
    }
  })

  it('возвращает независимые результаты при повторных запросах', () => {
    const first = mockParse({ records })
    first.items[0]!.result.city = 'изменено'
    expect(mockParse({ records }).items[0]?.result.city).toBe('Алматы')
  })
})

describe('запрос к серверу', () => {
  it('отправляет обёртку records и возвращает исходный порядок', async () => {
    const body = mockParse({ records })
    const { client, fetcher } = liveClient(body)
    expect(await client.parse(records)).toEqual(body)
    expect(fetcher).toHaveBeenCalledWith('/api/ui/parse', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ records }),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin', redirect: 'error',
    }))
  })

  it.each([null, {}, { sources: { city: 'string' } }, { spans: [] }])(
    'принимает пустые и неполные пояснения: %j', async (explain) => {
      const body = mockParse({ records })
      const { client } = liveClient({ items: body.items.map((item) => ({ ...item, explain })) })
      const result = await client.parse(records)
      expect(result.items[0]?.explain).toEqual(explain)
    },
  )

  it('отбрасывает неправильные позиции подсветки, сохраняя результат', async () => {
    const { client } = liveClient({ items: mockParse({ records }).items.map((item) => ({
      ...item, explain: { spans: [{ field: 'city', start: -1, end: 999 }], sources: { city: 'unknown' } },
    })) })
    expect((await client.parse(records)).items[0]?.explain).toEqual({ spans: [], sources: {} })
  })

  it('отклоняет переставленные записи даже при одинаковых id', async () => {
    const { client } = liveClient({ items: mockParse({ records }).items.reverse() })
    await expect(client.parse(records)).rejects.toMatchObject({ code: 'invalidResponse' })
  })

  it.each([
    { items: [] },
    { items: [{ result: {} }] },
    { items: mockParse({ records }).items.map((item) => ({ ...item, result: { ...item.result, confidence: 2 } })) },
    { items: mockParse({ records }).items.map((item) => ({ ...item, result: { ...item.result, house: 59 } })) },
  ])('отклоняет повреждённый ответ', async (body) => {
    const { client } = liveClient(body)
    await expect(client.parse(records)).rejects.toMatchObject({ code: 'invalidResponse' })
  })

  it('различает HTTP-ошибку, недоступность сети и неверный JSON', async () => {
    await expect(liveClient({}, 503).client.parse(records)).rejects.toMatchObject({ code: 'serverError', status: 503 })
    const failedFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createApiClient({ basePath: '/api', useMocks: false }, failedFetch).parse(records))
      .rejects.toMatchObject({ code: 'networkError' })
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>error</html>'))
    await expect(createApiClient({ basePath: '/api', useMocks: false }, invalidJson).parse(records))
      .rejects.toMatchObject({ code: 'invalidResponse' })
  })

  it.each([true, false])('сохраняет отмену запроса, useMocks=%s', async (useMocks) => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createApiClient({ basePath: '/api', useMocks }, fetcher)
    const controller = new AbortController()
    controller.abort()
    await expect(client.parse(records, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('передаёт отмену в активный запрос', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const pending = createApiClient({ basePath: '/api', useMocks: false }, fetcher).parse(records, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
