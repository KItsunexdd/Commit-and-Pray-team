import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Analysis } from './model'
import { percentage, unassignedRegion } from './model'
import { ru } from '../i18n/ru'
import '../result/result.css'
import { downloadFile, summaryName, xlsxMime } from '../export/download'
import { summarySheet } from '../export/records'

const number = (value: number) => value.toLocaleString('ru-RU')

export function AnalyticsPanel({ analysis, onRegion, onClose, inline = false, fileName }: { analysis: Analysis; onRegion(id: string): void; onClose(): void; inline?: boolean; fileName: string }) {
  const id = useId()
  const panel = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const gesture = useRef<{ y: number; height: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [region, setRegion] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const download = async () => {
    setExporting(true)
    try {
      const { workbook } = await import('../export/xlsx')
      downloadFile(workbook([summarySheet(analysis)]), xlsxMime, summaryName(fileName)); setExportError('')
    } catch { setExportError('Не удалось скачать сводку. Попробуйте ещё раз.') }
    finally { setExporting(false) }
  }
  const automatic = percentage(analysis.automaticBoth, analysis.total)
  const missing = analysis.total ? Math.round((100 - automatic) * 10) / 10 : 0
  const histogramMax = Math.max(1, ...analysis.histogram)
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current) return
    const delta = current.y - event.clientY
    suppressClick.current = current.moved
    if (event.type !== 'pointercancel' && Math.abs(delta) > 35) setExpanded(delta > 0)
    gesture.current = null; setDragging(false)
    panel.current?.style.removeProperty('--drag-height')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <section className={`result-panel analytics-panel ${expanded ? 'result-panel--expanded' : ''} ${dragging ? 'result-panel--dragging' : ''}`}
    data-result-panel="" ref={panel} aria-labelledby={`${id}-title`}>
    <button className="result-grab" aria-label={expanded ? ru.analytics.collapse : ru.analytics.expand} aria-expanded={expanded} aria-controls={`${id}-body`}
      onClick={() => { if (!suppressClick.current) setExpanded(value => !value); suppressClick.current = false }}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setExpanded(event.key === 'ArrowUp') } }}
      onPointerDown={event => {
        if (event.button !== 0) return
        gesture.current = { y: event.clientY, height: panel.current?.offsetHeight ?? 260, moved: false }
        suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        const current = gesture.current
        if (!current) return
        const delta = current.y - event.clientY
        if (Math.abs(delta) < 6 && !current.moved) return
        current.moved = true; setDragging(true)
        panel.current?.style.setProperty('--drag-height', `${Math.max(200, Math.min((window.visualViewport?.height ?? innerHeight) - 110, current.height + delta))}px`)
      }} onPointerUp={stopDrag} onPointerCancel={stopDrag}><span aria-hidden="true" /></button>
    <header className="result-header"><h2 id={`${id}-title`} ref={title} tabIndex={-1}>{ru.analytics.details}</h2>
      <button className="result-close" aria-label={ru.analytics.exit} onClick={onClose}>×</button></header>
    <div className="result-body" id={`${id}-body`} tabIndex={0} aria-label={ru.analytics.details}>
      <div className="analytics-export"><button className="file-button" disabled={exporting} onClick={() => { void download() }}>{exporting ? 'Готовим файл…' : 'Скачать сводку'}</button>
        {exportError && <p className="export-message export-error" role="alert">{exportError}</p>}</div>
      {inline && <section className="analytics-region-bars"><h3>Адреса по регионам</h3><ul>
        {[...analysis.regions].sort((a, b) => b.count - a.count).map(region => <li key={region.id}>
          <button onClick={() => onRegion(region.id)}><span>{region.name}</span><strong>{number(region.count)}</strong>
            <i aria-hidden="true" style={{ width: `${region.count / Math.max(1, ...analysis.regions.map(item => item.count)) * 100}%` }} /></button>
        </li>)}
        <li><button onClick={() => onRegion(unassignedRegion)}><span>{ru.analytics.unknown}</span><strong>{number(analysis.unknown)}</strong></button></li>
      </ul></section>}
      <section className="analytics-legend" aria-label={ru.analytics.legend}>
        <h3>{ru.analytics.legend}</h3>
        <ol className="analytics-scale">{analysis.scale.map(step => <li key={step.min}>
          <i style={{ background: step.color }} aria-hidden="true" /><span>{step.min === step.max ? number(step.min) : `${number(step.min)}–${number(step.max)}`}</span>
        </li>)}</ol>
        <div className="analytics-legend-extra"><span><i style={{ background: 'var(--analysis-zero)' }} aria-hidden="true" />0 · {ru.analytics.zero}</span>
          <button onClick={() => onRegion(unassignedRegion)}><i style={{ background: 'var(--analysis-unknown)' }} aria-hidden="true" />{ru.analytics.unknown}: <strong>{number(analysis.unknown)}</strong></button></div>
      </section>
      <dl className="analytics-totals">
        {[[ru.analytics.total, analysis.total], [ru.analytics.confident, analysis.confident], [ru.analytics.located, analysis.located]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{number(count as number)}</dd></div>)}
      </dl>
      <p className="analytics-edited">{ru.analytics.edited}: <strong>{number(analysis.edited)}</strong> {ru.analytics.records(analysis.edited)}</p>
      <section className="analytics-automatic" aria-label={ru.analytics.automatic}>
        <h3>{ru.analytics.automatic}</h3>
        <dl><div><dt>{ru.analytics.apartments}</dt><dd>{number(analysis.apartments)}</dd></div>
          <div><dt>{ru.analytics.both}</dt><dd>{number(analysis.automaticBoth)} <span>· {number(automatic)}%</span></dd></div></dl>
        {!!analysis.edited && <p className="analytics-note">{ru.analytics.original}</p>}
        <p className="analytics-delivery">{ru.analytics.delivery(number(automatic), number(missing))}</p>
      </section>
      <section className="analytics-ranking"><h3>{ru.analytics.topRegions}</h3>
        {!analysis.topRegions.length ? <p className="analytics-note">{ru.analytics.empty}</p> : <ol>{analysis.topRegions.map(item => <li key={item.id}>
          <button onClick={() => onRegion(item.id)}><span>{item.name}</span><strong>{number(item.count)}</strong></button>
        </li>)}</ol>}
      </section>
      <section className="analytics-ranking"><h3>{ru.analytics.topCities}</h3>
        {!analysis.topCities.length ? <p className="analytics-note">{ru.analytics.empty}</p> : <ol>{analysis.topCities.map(item => <li className="analytics-city-row" key={item.key}><span>{item.name}</span><strong>{number(item.count)}</strong></li>)}</ol>}
        <p className="analytics-note">{ru.analytics.missingCity}: {number(analysis.missingCity)}</p>
      </section>
      <section className="analytics-histogram" aria-label={ru.analytics.histogram}><h3>{ru.analytics.histogram}</h3>
        <ol>{analysis.histogram.map((count, index) => <li key={index} aria-label={`${ru.analytics.histogramLabels[index]}: ${number(count)}`}>
          <strong>{number(count)}</strong><div aria-hidden="true"><i style={{ height: `${count / histogramMax * 100}%` }} /></div><span>{ru.analytics.histogramLabels[index]}</span>
        </li>)}</ol><p className="analytics-note">{ru.analytics.histogramHint}</p>
      </section>
      <form className="analytics-region-picker" onSubmit={event => { event.preventDefault(); if (region) onRegion(region) }}>
        <label htmlFor={`${id}-region`}>{ru.analytics.chooseRegion}</label>
        <select id={`${id}-region`} value={region} onChange={event => setRegion(event.target.value)}><option value="">{ru.analytics.choose}</option>
          {analysis.regions.map(item => <option key={item.id} value={item.id}>{item.name} · {number(item.count)}</option>)}
          <option value={unassignedRegion}>{ru.analytics.unknown} · {number(analysis.unknown)}</option>
        </select><button className="file-button" disabled={!region}>{ru.analytics.open}</button>
      </form>
      <p className="analytics-note">{ru.analytics.currentHint} {ru.analytics.originalHint}</p>
    </div>
  </section>
}
