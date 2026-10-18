import { useEffect, useState } from 'react'
import type { AddressResult } from '../api/types'
import { singleJson, singleJsonFile } from './records'
import { downloadFile } from './download'
import { copyText } from './clipboard'
import './export.css'

export function RecordExport({ result }: { result: AddressResult }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer) } }, [copied])
  const copy = async () => {
    try { await copyText(singleJson(result)); setCopied(true); setError('') }
    catch { setError('Не удалось скопировать. Скачайте JSON кнопкой рядом.') }
  }
  return <div className="result-export">
    <button className="file-button" onClick={() => { void copy() }}>Копировать JSON</button>
    <button className="file-button" onClick={() => {
      try { downloadFile(singleJsonFile(result), 'application/json;charset=utf-8', 'address-result.json'); setError('') }
      catch { setError('Не удалось скачать файл. Попробуйте ещё раз.') }
    }}>Скачать JSON</button>
    <p className="export-message" role="status">{copied ? 'Скопировано' : ''}</p>
    {error && <p className="export-message export-error" role="alert">{error}</p>}
  </div>
}
