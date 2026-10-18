import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { addressFields } from '../api/types'
import type { ParseItem } from '../api/types'
import { fieldColors } from '../theme/address-fields'
import { ru } from '../i18n/ru'
import { explainAddress } from './explain'
import type { AddressLocation } from './location'
import './result.css'
import { RecordExport } from '../export/RecordExport'

export function ResultPanel({ item, location, onClose, inline = false }: { item: ParseItem; location: AddressLocation; onClose: () => void; inline?: boolean }) {
  const id = useId()
  const panel = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const gesture = useRef<{ startY: number; height: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { result } = item
  const { parts, sources } = useMemo(() => explainAddress(item), [item])
  const count = addressFields.filter((field) => result[field]?.trim()).length
  const confidence = Math.round(result.confidence * 100)

  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])
  const stopDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (!gesture.current) return
    const delta = gesture.current.startY - event.clientY
    suppressClick.current = gesture.current.moved
    if (!cancelled && Math.abs(delta) > 35) setExpanded(delta > 0)
    gesture.current = null
    setDragging(false)
    panel.current?.style.removeProperty('--drag-height')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <>
    {inline && <p className="result-breadcrumb" aria-label="Местоположение">{[result.city, result.district].filter(Boolean).join(' → ') || 'Местоположение не определено'}</p>}
    <section ref={panel} className={`result-panel ${expanded ? 'result-panel--expanded' : ''} ${dragging ? 'result-panel--dragging' : ''}`}
      aria-labelledby={`${id}-title`} data-result-panel="">
      <button className="result-grab" aria-label={expanded ? ru.result.collapse : ru.result.expand} aria-expanded={expanded} aria-controls={`${id}-body`}
        onClick={() => { if (!suppressClick.current) setExpanded((value) => !value); suppressClick.current = false }}
        onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setExpanded(event.key === 'ArrowUp') } }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          gesture.current = { startY: event.clientY, height: panel.current?.offsetHeight ?? 300, moved: false }
          suppressClick.current = false
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = gesture.current
          if (!current) return
          const delta = current.startY - event.clientY
          if (Math.abs(delta) < 6 && !current.moved) return
          current.moved = true
          setDragging(true)
          const max = (window.visualViewport?.height ?? innerHeight) - 100
          panel.current?.style.setProperty('--drag-height', `${Math.max(200, Math.min(max, current.height + delta))}px`)
        }} onPointerUp={(event) => stopDrag(event)} onPointerCancel={(event) => stopDrag(event, true)}>
        <span aria-hidden="true" />
      </button>
      <header className="result-header">
        <div><p className="result-eyebrow font-mono">{ru.result.eyebrow}</p><h2 id={`${id}-title`} ref={title} tabIndex={-1}>{ru.result.title}</h2></div>
        <button className="result-close" aria-label={ru.result.close} onClick={onClose}>×</button>
      </header>
      <div className="result-body" id={`${id}-body`} tabIndex={0} aria-label={ru.result.details}>
        <div className={`result-confidence ${result.confidence < 0.6 ? 'result-confidence--low' : ''}`}>
          <div><span>{ru.result.confidence}</span><strong>{confidence}%</strong></div>
          <p id={`${id}-confidence-hint`} className="result-confidence-hint">{ru.result.confidenceHint}</p>
          <div className="confidence-track" role="meter" aria-label={ru.result.confidence} aria-describedby={`${id}-confidence-hint`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidence}><span style={{ width: `${confidence}%` }} /></div>
          {result.confidence < 0.6 && <p>{ru.result.review}</p>}
        </div>
        <div className="result-original">
          <h3>{ru.result.original}</h3>
          <p className="address-highlight">{parts.map((part) => part.field
            ? <mark key={part.start} data-field={part.field} style={{ '--field-color': fieldColors[part.field] } as CSSProperties}
              title={ru.fields[part.field]} aria-label={`${ru.fields[part.field]}: ${part.text}`}>{part.text}</mark>
            : <span key={part.start}>{part.text}</span>)}</p>
          <p className="result-legend-hint">{ru.result.legend}</p>
        </div>
        {count === 0 && <p className="result-note">{ru.result.empty}</p>}
        {location.note && <p className="result-note" role="status">{ru.result.location[location.note]}</p>}
        <dl className="result-fields" aria-label={ru.result.fields}>
          {addressFields.map((field) => {
            const value = result[field]
            const present = !!value?.trim()
            return <div className={`result-field ${present ? '' : 'result-field--empty'}`} key={field} style={{ '--field-color': fieldColors[field] } as CSSProperties}>
              <dt><i aria-hidden="true" />{ru.fields[field]}</dt>
              <dd><span className="result-value">{present ? value : ru.result.missing}</span>
                {present && <small className={`field-source field-source--${sources[field] ?? 'unknown'}`}>{sources[field] === 'unknown' || !sources[field] ? ru.result.sourceUnknown : ru.sources[sources[field]]}</small>}
              </dd>
            </div>
          })}
        </dl>
        <RecordExport result={result} />
      </div>
    </section>
    </>
  )
}
