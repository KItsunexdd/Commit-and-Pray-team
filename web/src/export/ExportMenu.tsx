import { useEffect, useId, useRef, useState } from 'react'
import './export.css'

export function ExportMenu({ disabled, total, filtered, filterLabel, onExport }: {
  disabled: boolean; total: number; filtered: number; filterLabel: string
  onExport(format: 'json' | 'csv' | 'xlsx', filtered: boolean): Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState('all')
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const save = async (format: 'json' | 'csv' | 'xlsx') => {
    setBusy(true)
    try { await onExport(format, scope === 'filtered') }
    finally { setBusy(false); setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  }
  return <div className="export-menu" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <button type="button" className="file-button file-button--primary" disabled={disabled || busy} ref={trigger}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{busy ? 'Готовим файл…' : 'Выгрузить'}<span aria-hidden="true">↓</span></button>
    {open && <div id={id} className="export-options" role="group" aria-label="Выгрузка результатов">
      <label htmlFor={`${id}-scope`}>Объём выгрузки</label>
      <select id={`${id}-scope`} value={scope} disabled={busy} onChange={event => setScope(event.target.value)}>
        <option value="all">Все записи · {total}</option>
        <option value="filtered">Текущий фильтр · {filtered}</option>
      </select>
      {scope === 'filtered' && <p>{filterLabel}</p>}
      {(['json', 'xlsx', 'csv'] as const).map(format => <button type="button" key={format} disabled={busy}
        className="file-button" onClick={() => { void save(format) }}>{format === 'xlsx' ? 'Excel .xlsx' : format.toUpperCase()}</button>)}
    </div>}
  </div>
}
