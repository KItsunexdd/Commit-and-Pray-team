import type { AddressRecord, AddressValues, ParseResponse } from '../api/types'
import { readParseResponse } from '../api/validate'
import { ApiError } from '../api/errors'
import { ru } from '../i18n/ru'
import { editRow } from './document'
import type { FileRow, FileSource } from './document'

export interface FileState {
  source: FileSource | null
  rows: FileRow[]
  status: 'empty' | 'loaded' | 'running' | 'paused' | 'error' | 'done'
  error: string | null
}
interface Client { parse: (records: readonly AddressRecord[], signal?: AbortSignal) => Promise<ParseResponse> }

export function createFileSession(client: Client, batchSize = 50, timeoutMs = 60_000) {
  let state: FileState = { source: null, rows: [], status: 'empty', error: null }
  let revision = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: FileState) => { state = next; for (const listener of listeners) listener() }
  const abort = () => { revision++; controller?.abort(); controller = null; clearTimeout(timer) }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    load(source: FileSource) { abort(); publish({ source, rows: [], status: 'loaded', error: null }) },
    pause() { abort(); if (state.status === 'running') publish({ ...state, status: 'paused', error: null }) },
    edit(index: number, values: AddressValues) {
      const row = state.rows[index]
      if (!row) return
      const rows = [...state.rows]; rows[index] = editRow(row, values)
      publish({ ...state, rows })
    },
    async run() {
      if (!state.source || state.status === 'running' || state.status === 'done') return
      abort()
      const current = revision
      const { source } = state
      const request = new AbortController()
      controller = request
      publish({ ...state, status: 'running', error: null })
      try {
        while (state.rows.length < source.records.length) {
          if (revision !== current || request.signal.aborted) return
          const records = source.records.slice(state.rows.length, state.rows.length + Math.max(1, batchSize))
          timer = setTimeout(() => {
            if (revision !== current) return
            abort(); publish({ ...state, status: 'error', error: ru.files.timeout })
          }, timeoutMs)
          const response = await client.parse(records, request.signal)
          if (revision !== current || request.signal.aborted) return
          clearTimeout(timer)
          const { items } = readParseResponse(response, records)
          const rows = [...state.rows, ...items.map((item) => ({ item, original: { ...item.result }, edited: [] }))]
          publish({ ...state, rows, status: rows.length === source.records.length ? 'done' : 'running' })
        }
      } catch (error) {
        if (revision !== current || request.signal.aborted) return
        publish({ ...state, status: 'error', error: error instanceof ApiError ? error.message : ru.api.networkError })
      } finally { if (revision === current) { clearTimeout(timer); controller = null } }
    },
  }
}

export type FileSession = ReturnType<typeof createFileSession>
