import { ru } from '../i18n/ru'

export interface MapTelemetry { lon: number; lat: number; zoom: number; bearing: number }
export type MapStatus = 'loading' | 'ready' | 'error' | 'unsupported' | 'flying' | 'found' | 'cityFound' | 'returning'

export function Hud({ status, telemetry, paused, label = '' }: { status: MapStatus; telemetry: MapTelemetry | null; paused: boolean; label?: string }) {
  const current = status === 'loading' || status === 'error' ? null : telemetry
  const coordinates = current ? `${current.lat.toFixed(4)}° ${ru.map.north}  /  ${current.lon.toFixed(4)}° ${ru.map.east}` : '—'
  return (
    <div className={`hud ${['ready', 'found', 'cityFound'].includes(status) ? 'hud--ready' : ''}`} aria-hidden="true">
      <div className="hud-frame"><i /><i /><i /><i /></div>
      <div className="hud-topline font-mono"><span>{ru.map.identifier}</span><span className="hud-status" title={label}><i />{label || ru.map.status[status]}</span></div>
      <div className="hud-side hud-side--left font-mono"><span>{ru.map.spatial}</span><div className="hud-ruler" /><span>01 — 20</span></div>
      <div className="hud-side hud-side--right font-mono"><span>{ru.map.north}</span><div className="hud-compass" style={{ transform: `rotate(${-(current?.bearing ?? 0)}deg)` }}>↑</div><span>{current ? `${current.bearing.toFixed(1)}°` : '—'}</span></div>
      <div className="hud-crosshair"><i /><i /><i /><i /><span /></div>
      <div className="hud-bottomline font-mono"><span>{coordinates}</span><span className="hud-scale">{ru.map.scale} {current ? `${current.zoom.toFixed(2)}×` : '—'} <b>／</b> {paused ? ru.map.still : ru.map.live}</span></div>
    </div>
  )
}
