import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ParseItem } from '../api/types'
import { explainAddress } from '../result/explain'
import { fieldColors } from '../theme/address-fields'
import { ru } from '../i18n/ru'

export function HighlightedAddress({ item }: { item: ParseItem }) {
  const { parts } = useMemo(() => explainAddress(item), [item])
  return <p className="address-highlight">{parts.map((part) => part.field
    ? <mark key={part.start} data-field={part.field} style={{ '--field-color': fieldColors[part.field] } as CSSProperties}
      title={ru.fields[part.field]}>{part.text}</mark>
    : <span key={part.start}>{part.text}</span>)}</p>
}
