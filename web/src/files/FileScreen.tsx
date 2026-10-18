import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { addressFields } from '../api/types'
import { ru } from '../i18n/ru'
import { fieldColors } from '../theme/address-fields'
import type { FileSession } from './session'
import { filePositions, summarizeFile, unassignedRegion } from '../analytics/model'
import type { Analysis } from '../analytics/model'
import { exportResults, readFile } from './document'
import { ExportMenu } from '../export/ExportMenu'
import { addressSheet, csvRecords, selectExport, summarySheet } from '../export/records'
import { downloadFile, exportName, xlsxMime } from '../export/download'
import type { usePlaces } from '../search/usePlaces'
import type { FileRow, FileSource } from './document'
import { RecordEditor } from './RecordEditor'
import { HighlightedAddress } from './HighlightedAddress'
import './files.css'

const pageSize = 25

export function FileScreen({ active, session, analysis, regionFilter, onRegionFilter, onShowMap, geoStatus, onRetryGeo, geo }: {
  active: boolean; session: FileSession; analysis: Analysis | null; regionFilter: string | null
  onRegionFilter(id: string | null): void; onShowMap(): void; geoStatus: string; onRetryGeo(): void
  geo: ReturnType<typeof usePlaces>['data']
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const { source, rows, status, error } = state
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [pending, setPending] = useState<FileSource | null>(null)
  const [filter, setFilter] = useState(false)
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [exported, setExported] = useState<readonly FileRow[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const screen = useRef<HTMLElement>(null)
  const table = useRef<HTMLTableElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const readRevision = useRef(0)
  const opener = useRef<HTMLButtonElement | null>(null)
  const summary = useMemo(() => ({ low: rows.filter((row) => row.item.result.confidence < .6).length, edited: rows.filter((row) => row.edited.length).length }), [rows])
  const positions = useMemo(() => filePositions(rows, filter, regionFilter, analysis?.rowRegions ?? []), [rows, filter, regionFilter, analysis])
  const regionName = regionFilter === unassignedRegion ? ru.analytics.unknown : analysis?.regions.find(region => region.id === regionFilter)?.name
  const pages = Math.max(1, Math.ceil(positions.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  const visible = positions.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const running = status === 'running'

  useEffect(() => { if (active) heading.current?.focus({ preventScroll: true }); else session.pause() }, [active, session])
  useEffect(() => () => { readRevision.current++; session.pause() }, [session])
  useEffect(() => {
    if (!rows.length || exported === rows) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [rows, exported])

  const install = (next: FileSource) => {
    session.load(next); setPending(null); setPage(0); setFilter(false); setEditing(null); setExported(null); setAnnouncement(''); onRegionFilter(null)
    screen.current?.scrollTo({ top: 0 })
  }
  const offer = (next: FileSource) => { screen.current?.scrollTo({ top: 0 }); if (source) { session.pause(); setPending(next) } else install(next) }
  const choose = async (file: File | undefined) => {
    if (!file) return
    const current = ++readRevision.current
    setReading(true); setFileError(null); setPending(null)
    try { const next = await readFile(file); if (readRevision.current === current) offer(next) }
    catch (error) { if (readRevision.current === current) { setFileError(error instanceof Error ? error.message : ru.files.readError); screen.current?.scrollTo({ top: 0 }) } }
    finally { if (readRevision.current === current) setReading(false) }
  }
  const sample = () => {
    readRevision.current++; setReading(false); setFileError(null)
    offer({ name: ru.files.sampleName, records: ru.examples.map((raw_address, index) => ({ id: index < 2 ? '001' : String(index + 1).padStart(3, '0'), raw_address })) })
  }
  const download = async (format: 'json' | 'csv' | 'xlsx', filtered: boolean) => {
    if (!source) return
    try {
      const selected = selectExport(source, rows, filtered ? positions : undefined)
      const name = exportName(source.name, format)
      if (format === 'json') downloadFile(exportResults(selected.source, selected.rows), 'application/json;charset=utf-8', name)
      else if (format === 'csv') downloadFile(csvRecords(selected.rows), 'text/csv;charset=utf-8', name)
      else {
        if (!geo) throw new Error('Для сводки нужен справочник регионов. Повторите его загрузку или сохраните JSON / CSV.')
        const { workbook } = await import('../export/xlsx')
        downloadFile(workbook([addressSheet(selected.rows), summarySheet(summarizeFile(selected.rows, geo.regions, geo.cities))]), xlsxMime, name)
      }
      if (!filtered || positions.length === rows.length) setExported(rows)
      setFileError(null); setAnnouncement(`Файл ${name} подготовлен: ${selected.rows.length} ${ru.analytics.records(selected.rows.length)}.`)
    } catch (error) { setFileError(error instanceof Error ? error.message : ru.files.downloadError) }
  }
  const closeEditor = () => {
    setEditing(null)
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); else heading.current?.focus({ preventScroll: true }) })
  }
  const changePage = (next: number) => {
    setPage(next)
    requestAnimationFrame(() => { table.current?.focus({ preventScroll: true }); table.current?.scrollIntoView({ block: 'start' }) })
  }
  return <main id="files" className="file-screen" ref={screen} hidden={!active}>
    <div className="file-intro"><p className="file-eyebrow">{ru.files.eyebrow}</p><h1 ref={heading} tabIndex={-1}>{ru.files.title}</h1><p>{ru.files.subtitle}</p></div>
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label={ru.files.choose}
      onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
    {fileError && <p className="file-message file-message--error" role="alert">{fileError}</p>}
    {pending && <div className="file-message file-replace" role="alert"><strong>{ru.files.replaceTitle}</strong><p>{pending.name}</p><p>{ru.files.replaceHint}</p><div>
      <button className="file-button" onClick={() => setPending(null)}>{ru.files.keep}</button>
      <button className="file-button file-button--primary" onClick={() => install(pending)}>{ru.files.replaceConfirm}</button>
    </div></div>}
    {!source ? <section className={`file-drop ${dragging ? 'file-drop--active' : ''}`} aria-label={ru.files.uploadTitle}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]) }}>
      <svg className="file-upload-symbol" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 5h16l9 9v29H12zM28 5v10h9M24 34V22m-5 5 5-5 5 5" /></svg>
      <h2>{ru.files.uploadTitle}</h2><p>{ru.files.uploadHint}</p>
      <div className="file-upload-actions"><button className="file-button file-button--primary" disabled={reading} onClick={() => input.current?.click()}>{reading ? ru.files.reading : ru.files.choose}</button><button className="file-button" onClick={sample}>{ru.files.sample}</button></div>
      <code>{ru.files.inputExample}</code>
      <p className="file-help">{ru.files.format}</p><p className="file-help">{ru.files.limits}</p>
    </section> : <>
      <section className="file-workspace" aria-label={source.name}>
        <div className="file-toolbar"><div className="file-name"><span className="file-eyebrow">JSON</span><strong title={source.name}>{source.name}</strong></div>
          <div className="file-toolbar-actions"><button className="file-button" disabled={reading || running} onClick={() => input.current?.click()}>{reading ? ru.files.reading : ru.files.replace}</button>
            {status === 'done' && <button className="file-button" disabled={!analysis || !!pending || reading} onClick={() => { setPage(0); setFilter(false); onShowMap() }}>{ru.analytics.show}<span aria-hidden="true">↗</span></button>}
            <ExportMenu disabled={status !== 'done' || !!pending || reading} total={rows.length} filtered={positions.length}
              filterLabel={[filter ? 'Нужна проверка' : '', regionName].filter(Boolean).join(' · ') || 'Фильтры не установлены — все записи.'} onExport={download} /></div>
        </div>
        {status === 'done' && geoStatus !== 'ready' && <p className="file-geo-status" role="status">{geoStatus === 'error' ? ru.analytics.geoError : ru.analytics.geoLoading}
          {geoStatus === 'error' && <button className="file-button" onClick={onRetryGeo}>{ru.analytics.retry}</button>}</p>}
        <div className="file-stats"><div><strong>{source.records.length.toLocaleString('ru-RU')}</strong><span>{ru.files.total}</span></div><div className="file-stat-low"><strong>{summary.low}</strong><span>{ru.files.needsReview}</span></div><div><strong>{summary.edited}</strong><span>{ru.files.reviewed}</span></div></div>
        <div className="file-progress"><div><p role="status">{error || (status === 'done' ? ru.files.done : status === 'running' ? ru.files.running : status === 'paused' ? ru.files.paused : ru.files.loaded)}</p>
          <span>{ru.files.progress(rows.length, source.records.length)}</span></div>
          {status !== 'done' && <button className="file-button" disabled={!!pending || reading} onClick={() => running ? session.pause() : void session.run()}>{running ? ru.files.pause : status === 'loaded' ? ru.files.start : ru.files.resume}</button>}
          <progress aria-label={ru.files.progress(rows.length, source.records.length)} value={rows.length} max={source.records.length} />
        </div>
        <div className="file-filter"><label><input type="checkbox" checked={filter} onChange={(event) => { setFilter(event.target.checked); setPage(0) }} /><span>{ru.files.needsReview}</span><small>{summary.low}</small></label><p>{ru.files.filterHint}</p></div>
        {regionFilter !== null && <div className="file-region-filter" role="status"><span>{ru.analytics.filter}: <strong>{regionName}</strong> · {positions.length}</span>
          <button className="file-button" onClick={() => { onRegionFilter(null); setPage(0) }}>{ru.analytics.clearFilter}<span aria-hidden="true">×</span></button></div>}
        {!visible.length ? <p className="file-empty" role="status">{rows.length ? ru.files.filterEmpty : ru.files.waiting}</p> : <table className="file-table" ref={table} tabIndex={-1}>
          <caption className="sr-only">{ru.files.title}</caption><thead><tr><th scope="col">{ru.files.number} / {ru.files.id}</th><th scope="col">{ru.files.address}</th><th scope="col">{ru.files.confidence}</th><th scope="col">{ru.files.actions}</th></tr></thead>
          <tbody>{visible.map((index) => {
            const row = rows[index]!, result = row.item.result
            return <tr key={index} data-position={index}>
              <td className="file-row-id"><strong>{ru.files.row(index + 1)}</strong><span title={result.id}>{ru.files.id}: {result.id || '—'}</span></td>
              <td className="file-row-address"><HighlightedAddress item={row.item} /><dl className="file-field-chips">{addressFields.filter((field) => result[field] !== null).map((field) => <div key={field} style={{ '--field-color': fieldColors[field] } as CSSProperties}><dt>{ru.fields[field]}</dt><dd>{result[field]}</dd></div>)}</dl></td>
              <td className="file-row-confidence"><span className={`file-score ${result.confidence < .6 ? 'file-score--low' : ''}`}>{Math.round(result.confidence * 100)}%</span>{result.confidence < .6 && <small>{ru.files.needsReview}</small>}{!!row.edited.length && <small className="file-edited">{ru.files.changed}</small>}</td>
              <td className="file-row-action"><button className="file-button" aria-label={ru.files.editRow(index + 1)} onClick={(event) => { opener.current = event.currentTarget; setEditing(index) }}>{ru.files.edit}<span aria-hidden="true">↗</span></button></td>
            </tr>
          })}</tbody>
        </table>}
        {pages > 1 && <nav className="file-pagination" aria-label={ru.files.pagination}><button className="file-button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>{ru.files.previous}</button><span>{ru.files.page(currentPage + 1, pages)}</span><button className="file-button" disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)}>{ru.files.next}</button></nav>}
      </section>
      <p className="file-help">{status !== 'done' ? ru.files.downloadPending : ru.files.exportHint}</p>
    </>}
    <p className="file-privacy">{ru.files.privacy}</p>
    <p className="file-attribution">{ru.app.osmAttribution}</p>
    <p className="sr-only" role="status">{announcement}</p>
    {active && editing !== null && rows[editing] && <RecordEditor key={editing} row={rows[editing]} index={editing} onClose={closeEditor} onSave={(values) => { session.edit(editing, values); setAnnouncement(ru.files.saved(editing + 1)); closeEditor() }} />}
  </main>
}
