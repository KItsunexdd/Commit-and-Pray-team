import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { addressFields } from '../api/types'
import type { AddressValues } from '../api/types'
import { ru } from '../i18n/ru'
import { explainAddress } from '../result/explain'
import { fieldColors } from '../theme/address-fields'
import type { FileRow } from './document'
import { HighlightedAddress } from './HighlightedAddress'

export function RecordEditor({ row, index, onSave, onClose }: {
  row: FileRow; index: number; onSave: (values: AddressValues) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [initial] = useState(row.item.result)
  const [draft, setDraft] = useState<AddressValues>(() => ({ ...row.item.result }))
  const [discard, setDiscard] = useState(false)
  const { sources } = useMemo(() => explainAddress(row.item), [row.item])
  const dirty = addressFields.some((field) => (draft[field] ?? '') !== (initial[field] ?? ''))
  const close = () => { if (dirty) setDiscard(true); else onClose() }
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      if (!dialog.current) return
      dialog.current.style.setProperty('--editor-height', `${viewport?.height ?? innerHeight}px`)
      dialog.current.style.setProperty('--editor-top', `${viewport?.offsetTop ?? 0}px`)
    }
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update)
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update) }
  }, [])
  return <dialog ref={dialog} className="file-editor" aria-labelledby="file-editor-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <form onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
      <header className="file-editor-header">
        <div><p className="file-eyebrow">{ru.files.row(index + 1)}</p><h2 id="file-editor-title">{ru.files.editTitle}</h2></div>
        <button type="button" className="file-icon-button" onClick={close} aria-label={ru.files.close}>×</button>
      </header>
      <div className="file-editor-body">
        <p className="file-record-id">{ru.files.id}: {row.item.result.id || '—'}</p>
        <HighlightedAddress item={row.item} />
        <p className="file-help">{ru.result.legend}</p>
        <div className="file-editor-confidence"><strong>{ru.files.confidence}: {Math.round(row.item.result.confidence * 100)}%</strong><p>{ru.files.confidenceHint}</p></div>
        <p className="file-help">{ru.files.editHint}</p>
        <div className="file-edit-fields">{addressFields.map((field) => <label key={field} style={{ '--field-color': fieldColors[field] } as CSSProperties}>
          <span><i aria-hidden="true" />{ru.fields[field]}</span>
          <input name={field} value={draft[field] ?? ''} autoComplete="off" onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
          {row.item.result[field] && <small>{row.edited.includes(field) ? ru.files.fieldEdited : sources[field] === 'string' || sources[field] === 'dictionary' ? ru.sources[sources[field]] : ru.result.sourceUnknown}</small>}
        </label>)}</div>
      </div>
      <footer className="file-editor-footer">
        {discard ? <div className="file-discard" role="alert"><p>{ru.files.discard}</p><div>
          <button type="button" className="file-button" onClick={onClose}>{ru.files.discardConfirm}</button>
          <button type="button" className="file-button file-button--primary" onClick={() => setDiscard(false)}>{ru.files.continueEdit}</button>
        </div></div> : <><button type="button" className="file-button" onClick={close}>{ru.files.cancel}</button><button className="file-button file-button--primary" type="submit">{ru.files.save}</button></>}
      </footer>
    </form>
  </dialog>
}
