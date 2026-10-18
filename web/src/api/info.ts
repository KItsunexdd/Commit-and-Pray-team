import { ApiError } from './errors'

export const metricFields = ['score', 'address', 'details', 'reference'] as const
export interface InfoSource { name: string; url: string | null; date: string | null }
export interface ServiceInfo {
  version: string
  gazetteer: { sources: InfoSource[]; counts: Record<string, number> }
  metrics: ({ version: string } & Record<typeof metricFields[number], number>)[]
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const invalid = (): never => { throw new ApiError('invalidResponse') }

export function sourceLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function readInfo(value: unknown): ServiceInfo {
  if (!object(value) || typeof value.version !== 'string' || !object(value.gazetteer)) return invalid()
  const { gazetteer } = value
  if (!Array.isArray(gazetteer.sources) || !object(gazetteer.counts)) return invalid()
  const sources = gazetteer.sources.map((source: unknown): InfoSource => {
    if (!object(source) || typeof source.name !== 'string' || !source.name.trim()) return invalid()
    return { name: source.name, url: sourceLink(source.url), date: typeof source.date === 'string' ? source.date : null }
  })
  const counts = Object.fromEntries(Object.entries(gazetteer.counts).map(([key, count]) => {
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return invalid()
    return [key, count]
  }))
  const rows = value.metrics ?? []
  if (!Array.isArray(rows)) return invalid()
  const metrics = rows.map((row: unknown) => {
    if (!object(row) || typeof row.version !== 'string'
      || !metricFields.every(field => typeof row[field] === 'number' && Number.isFinite(row[field]))) return invalid()
    return { version: row.version, ...Object.fromEntries(metricFields.map(field => [field, row[field]])) } as ServiceInfo['metrics'][number]
  })
  return { version: value.version, gazetteer: { sources, counts }, metrics }
}

export async function fetchInfo(basePath: string, signal?: AbortSignal, request: typeof fetch = globalThis.fetch, timeoutMs = 8000): Promise<ServiceInfo> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await request(`${basePath}/info`, { headers: { Accept: 'application/json' }, signal: controller.signal,
        credentials: 'same-origin', redirect: 'error' })
    } catch { signal?.throwIfAborted(); throw new ApiError('networkError') }
    if (!response.ok) throw new ApiError('serverError', response.status)
    let value: unknown
    try { value = await response.json() } catch { signal?.throwIfAborted(); throw new ApiError('invalidResponse') }
    signal?.throwIfAborted()
    return readInfo(value)
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}
