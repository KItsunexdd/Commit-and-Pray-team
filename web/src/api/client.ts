import { readApiConfig } from './config'
import type { ApiConfig } from './config'
import { ApiError } from './errors'
import type { AddressRecord, ParseRequest, ParseResponse } from './types'
import { readParseResponse } from './validate'
import { fetchInfo } from './info'

export function createApiClient(config: ApiConfig, request: typeof fetch = globalThis.fetch) {
  return {
    // Сведения о справочнике и качестве всегда получаем от сервера, в том числе при моках разбора.
    info: (signal?: AbortSignal) => fetchInfo(config.basePath, signal, request),
    async parse(records: readonly AddressRecord[], signal?: AbortSignal): Promise<ParseResponse> {
      signal?.throwIfAborted()
      const payload: ParseRequest = { records: records.map((record) => ({ ...record })) }

      if (config.useMocks) {
        const { mockParse } = await import('./mocks')
        signal?.throwIfAborted()
        return mockParse(payload)
      }

      let response: Response
      try {
        response = await request(`${config.basePath}/ui/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: signal ?? null,
          credentials: 'same-origin',
          redirect: 'error',
        })
      } catch {
        signal?.throwIfAborted()
        throw new ApiError('networkError')
      }

      if (!response.ok) throw new ApiError('serverError', response.status)
      let value: unknown
      try {
        value = await response.json()
      } catch {
        signal?.throwIfAborted()
        throw new ApiError('invalidResponse')
      }
      signal?.throwIfAborted()
      return readParseResponse(value, payload.records)
    },
  }
}

export const api = createApiClient(readApiConfig(import.meta.env))
