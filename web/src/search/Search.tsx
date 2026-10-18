import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ru } from '../i18n/ru'
import { findPlaces } from './places'
import type { Place } from './places'
import type { usePlaces } from './usePlaces'
import type { ParseState } from '../result/parse-session'
import { vanish } from './vanish'
import './search.css'

export function Search({ selection, onSelect, onReset, query, onQuery: setQuery, places, parseState, onParse, onCancel, lookupFailed, motionRunning, mapVisible }: {
  selection: Place | null; onSelect: (place: Place) => void; onReset: () => void; query: string; onQuery: (value: string) => void
  places: ReturnType<typeof usePlaces>; parseState: ParseState; onParse: (raw: string) => void; onCancel: () => void; lookupFailed: boolean
  motionRunning: boolean; mapVisible: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const stopVanish = useRef<() => void>(() => {})
  const vanishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [example, setExample] = useState(0)
  const [vanishing, setVanishing] = useState(false)
  const results = useMemo(() => findPlaces(places.data?.index ?? [], query), [places.data, query])
  const busy = parseState.status === 'loading'
  const expanded = open && !busy && !!query.trim() && places.status === 'ready' && results.length > 0

  useEffect(() => {
    if (focused || query || !motionRunning) return
    const timer = setInterval(() => setExample((value) => (value + 1) % ru.examples.length), 4500)
    return () => clearInterval(timer)
  }, [focused, query, motionRunning])

  useEffect(() => {
    if (!expanded) return
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, expanded, id])

  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      const el = root.current
      if (!el) return
      const bottom = (viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0)
      const keyboard = focused && (viewport?.height ?? innerHeight) < innerHeight * 0.78
      el.closest('.app-shell')?.classList.toggle('keyboard-open', keyboard)
      el.style.setProperty('--suggestion-height', `${Math.max(80, Math.min(330, bottom - el.getBoundingClientRect().top - 92))}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [focused])

  useEffect(() => () => { stopVanish.current(); clearTimeout(vanishTimer.current) }, [])

  const reset = () => { stopVanish.current(); setVanishing(false); setQuery(''); setActive(0); setOpen(false); onReset() }
  const animateSubmission = () => {
    stopVanish.current()
    clearTimeout(vanishTimer.current)
    if (input.current && canvas.current && motionRunning) {
      stopVanish.current = vanish(canvas.current, input.current)
      setVanishing(true)
      vanishTimer.current = setTimeout(() => setVanishing(false), 460)
    }
    setActive(0)
    setOpen(false)
    input.current?.blur()
  }
  const choose = (place: Place) => {
    animateSubmission()
    setQuery(place.name)
    onSelect({ ...place })
  }
  const submit = () => {
    if (busy || !query.trim()) return
    const place = results[active] ?? results[0]
    if (place) choose(place)
    else { animateSubmission(); onParse(query) }
  }
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) { if (event.key === 'Enter') event.preventDefault(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((value) => results.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0)
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); reset() }
  }

  return (
    <div className={`place-search ${lookupFailed || parseState.status === 'error' ? 'place-search--error' : ''}`} ref={root}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setOpen(false) } }}>
      <form role="search" aria-label={ru.search.label} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (!vanishing) submit() }}>
        <div className={`search-field ${vanishing ? 'search-field--vanishing' : ''}`}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <div className="search-input-wrap">
            <label className="sr-only" htmlFor={`${id}-input`}>{ru.search.label}</label>
            <input ref={input} id={`${id}-input`} role="combobox" value={query} autoComplete="off" spellCheck={false}
              enterKeyHint="search" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined}
              aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
              aria-describedby={`${id}-help`} aria-invalid={lookupFailed} onKeyDown={keys}
              onFocus={() => { setFocused(true); setOpen(true) }}
              onChange={(event) => { stopVanish.current(); setVanishing(false); setQuery(event.target.value); setActive(0); setOpen(true) }} />
            {!query && <span key={example} className="search-placeholder" aria-hidden="true">{ru.examples[example]}</span>}
            <canvas ref={canvas} className="search-vanish" aria-hidden="true" />
          </div>
          {query && <button type="button" className="search-clear" aria-label={ru.search.clear} onClick={() => { reset(); input.current?.focus() }}>×</button>}
          <button className="search-submit" type="submit" aria-label={ru.search.submit} disabled={busy || !query.trim() || vanishing}>
            {busy ? <span className="search-spinner" aria-hidden="true" /> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>}
          </button>
        </div>
        <div id={`${id}-help`} className={`search-help ${busy ? 'search-help--busy' : ''}`} role="status">
          {busy ? <>{ru.result.loading}<button type="button" onClick={onCancel}>{ru.result.cancel}</button></> :
            lookupFailed ? ru.search.notFound : places.status === 'error' ? <>{ru.search.loadError}<button type="button" onClick={places.retry}>{ru.map.retry}</button></> :
            places.status === 'loading' ? ru.search.loading : open && query.trim() && !results.length ? ru.result.addressHint : selection ? mapVisible ? ru.search.selectedHint : ru.search.selectedHintWithoutMap : ru.search.hint}
        </div>
        {parseState.status === 'error' && <div className="parse-feedback" role="alert"><p>{parseState.message}</p><button type="button" onClick={() => onParse(parseState.raw)}>{ru.result.retry}</button></div>}
        {expanded && <ul className="search-results" id={`${id}-list`} role="listbox" aria-label={ru.search.suggestions}>
          {results.map((place, position) => (
            <li key={place.key} id={`${id}-option-${position}`} role="option" aria-selected={active === position}
              onPointerDown={(event) => event.preventDefault()} onClick={() => choose(place)} onPointerMove={() => setActive(position)}>
              <span className="search-result-icon" aria-hidden="true">{place.city ? '◉' : '◇'}</span>
              <span className="search-result-copy"><strong>{place.name}</strong><small>{place.city ? place.region.kind === 'city' ? ru.search.republicCity : place.region.name_ru : `${ru.search.center}: ${place.region.center.name}`}</small></span>
              <span className="search-result-type">{place.city ? ru.search.city : ru.search.region}</span>
            </li>
          ))}
        </ul>}
      </form>
    </div>
  )
}
