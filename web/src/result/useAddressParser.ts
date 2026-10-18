import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { createParseSession } from './parse-session'

export function useAddressParser() {
  const [session] = useState(() => createParseSession(api))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => () => session.cancel(), [session])
  return { state, parse: session.parse, cancel: session.cancel, cancelPending: session.cancelPending }
}
