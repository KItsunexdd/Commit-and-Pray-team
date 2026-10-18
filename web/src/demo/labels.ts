import { ru } from '../i18n/ru'
import { demoAddresses } from './session'
import type { DemoState } from './session'

export function demoLabel(state: DemoState) {
  if (state.phase === 'preparing') return ru.demo.preparing
  return state.phase === 'idle' ? '' : `${ru.demo.progress(state.index + 1, demoAddresses.length)}${state.paused ? ` · ${ru.demo.paused}` : state.phase === 'done' ? ` · ${ru.demo.done}` : ''}`
}
