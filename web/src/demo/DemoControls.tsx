import { ru } from '../i18n/ru'
import { demoRunning } from './session'
import type { DemoState } from './session'
import { demoLabel } from './labels'
import './demo.css'

export function DemoControls({ state, onPause, onStop, onStart }: {
  state: DemoState; onPause(): void; onStop(): void; onStart(): void
}) {
  if (state.phase === 'idle') return null
  return <div className="demo-controls" data-demo-control="" aria-label={ru.demo.controls}>
    <p className="font-mono" role="status">{demoLabel(state)}</p>
    {demoRunning(state)
      ? <button type="button" aria-pressed={state.paused} onClick={onPause}>{state.paused ? ru.demo.resume : ru.demo.pause}</button>
      : <button type="button" onClick={onStart}>{ru.demo.repeat}</button>}
    <button type="button" onClick={onStop}>{state.phase === 'done' ? ru.demo.close : ru.demo.stop}</button>
  </div>
}
