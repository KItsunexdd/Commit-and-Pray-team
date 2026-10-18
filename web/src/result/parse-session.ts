import type { AddressRecord, ParseItem, ParseResponse } from '../api/types'
import { ApiError } from '../api/errors'
import { ru } from '../i18n/ru'

export type ParseState = { status: 'idle' } | { status: 'loading'; raw: string } |
  { status: 'ready'; raw: string; item: ParseItem; revision: number } | { status: 'error'; raw: string; message: string }
interface ParseClient { parse: (records: readonly AddressRecord[], signal?: AbortSignal) => Promise<ParseResponse> }

export function createParseSession(client: ParseClient, timeoutMs = 30_000) {
  let state: ParseState = { status: 'idle' }
  let revision = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: ParseState) => { state = next; for (const listener of listeners) listener() }
  const abort = () => { revision++; controller?.abort(); controller = null; clearTimeout(timer) }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    cancel: () => { abort(); if (state.status !== 'idle') publish({ status: 'idle' }) },
    cancelPending: () => { if (state.status === 'loading') { abort(); publish({ status: 'idle' }) } },
    async parse(raw: string) {
      abort()
      if (!raw.trim()) { publish({ status: 'idle' }); return }
      const current = revision
      const request = new AbortController()
      controller = request
      publish({ status: 'loading', raw })
      timer = setTimeout(() => {
        if (current !== revision) return
        abort()
        publish({ status: 'error', raw, message: ru.result.timeout })
      }, timeoutMs)
      try {
        const response = await client.parse([{ id: 'address-0', raw_address: raw }], request.signal)
        if (current !== revision || request.signal.aborted) return
        const item = response.items[0]
        if (!item) throw new ApiError('invalidResponse')
        publish({ status: 'ready', raw, item, revision: current })
      } catch (error) {
        if (current !== revision || request.signal.aborted) return
        publish({ status: 'error', raw, message: error instanceof ApiError ? error.message : ru.api.networkError })
      } finally {
        if (current === revision) { clearTimeout(timer); controller = null }
      }
    },
  }
}
