import { ru } from './i18n/ru'
import { MapScene } from './map/MapScene'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Search } from './search/Search'
import type { Place } from './search/places'
import { usePlaces } from './search/usePlaces'
import { useAddressParser } from './result/useAddressParser'
import { locateAddress } from './result/location'
import { ResultPanel } from './result/ResultPanel'
import type { AddressLocation } from './result/location'
import { useMotionSettings } from './effects/useMotionSettings'
import { lowPowerDevice } from './effects/quality'
import { FileScreen } from './files/FileScreen'
import { useDemo } from './demo/useDemo'
import { DemoControls } from './demo/DemoControls'
import { demoLabel } from './demo/labels'
import { api } from './api/client'
import { createFileSession } from './files/session'
import { summarizeFile } from './analytics/model'
import { AnalyticsPanel } from './analytics/AnalyticsPanel'
import './analytics/analytics.css'
import { AboutScreen } from './about/AboutScreen'
import { ThemeToggle } from './theme/ThemeToggle'
import { currentTheme, subscribeTheme } from './theme/store'
import { isMapShortcut, loadMapVisibility, saveMapVisibility } from './map/visibility'
import './map/workspace.css'

const currentScreen = () => location.hash === '#files' ? 'files' : location.hash === '#about' ? 'about' : 'main'

export function App() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme)
  const [screen, setScreen] = useState(currentScreen)
  const filesOpen = screen === 'files', aboutOpen = screen === 'about', mapOpen = screen === 'main'
  const [manualSelection, setSelection] = useState<Place | null>(null)
  const [query, setQuery] = useState('')
  const [paused, setPaused] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [warmMap, setWarmMap] = useState(false)
  const [mapVisible, setMapVisible] = useState(() => { try { return loadMapVisibility(localStorage) } catch { return true } })
  const sceneVisible = mapVisible && mapOpen
  const onMapReady = useCallback((ready: boolean) => { setMapReady(ready); if (ready) setWarmMap(true) }, [])
  const toggleMap = useCallback(() => setMapVisible(value => {
    try { saveMapVisibility(!value, localStorage) } catch { /* Карта переключается и без хранилища. */ }
    return !value
  }), [])
  const [economy, setEconomy] = useState(() => window.innerWidth < 640 || lowPowerDevice(navigator))
  const onSlow = useCallback(() => setEconomy(true), [])
  const places = usePlaces()
  const [fileSession] = useState(() => createFileSession(api))
  const fileState = useSyncExternalStore(fileSession.subscribe, fileSession.getSnapshot)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const analysis = useMemo(() => fileState.status === 'done' && places.data
    ? summarizeFile(fileState.rows, places.data.regions, places.data.cities, theme) : null, [fileState, places.data, theme])
  const activeAnalysis = analyticsOpen && mapOpen ? analysis : null
  const { state: parseState, parse: parseRequest, cancel: cancelParse, cancelPending } = useAddressParser()
  const resultLocation = useMemo<AddressLocation>(() => parseState.status !== 'ready' ? { place: null, note: null } : places.data
    ? locateAddress(parseState.item.result, places.data.regions, places.data.cities) : { place: null, note: 'unavailable' }, [parseState, places.data])
  const hasResult = parseState.status === 'ready'
  const selection = hasResult ? resultLocation.place : manualSelection
  const reset = useCallback(() => { cancelParse(); setSelection(null); setQuery('') }, [cancelParse])
  const changeQuery = (value: string) => { cancelParse(); setQuery(value) }
  const parseAddress = (raw: string) => { setSelection(null); void parseRequest(raw) }
  const demo = useDemo({
    parseState, mapReady: mapOpen && (!mapVisible || mapReady), mapEnabled: mapVisible, prepare: reset, type: setQuery, parse: parseAddress, overview: reset,
    cancelPending,
    openMain: () => { setAnalyticsOpen(false); setScreen('main'); if (location.hash !== '#main') location.hash = '#main' },
  })
  const motion = useMotionSettings(paused || economy || !sceneVisible || demo.state.paused)
  const choosePlace = (place: Place) => { cancelParse(); setSelection(place) }
  const closeResult = () => { reset(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[role="combobox"]')?.focus({ preventScroll: true })) }
  const exitAnalysis = () => { setAnalyticsOpen(false); reset() }
  const openAnalysis = () => {
    demo.stop(); reset(); setAnalyticsOpen(true); setScreen('main')
    if (location.hash !== '#main') location.hash = '#main'
  }
  const showRegion = (id: string) => {
    setRegionFilter(id); setAnalyticsOpen(false); setScreen('files'); location.hash = '#files'
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (isMapShortcut(event)) { event.preventDefault(); toggleMap() } }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [toggleMap])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (mapOpen && event.key === 'Escape' && !event.isComposing) { setAnalyticsOpen(false); reset() } }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [reset, mapOpen])
  useEffect(() => {
    const changed = () => { const next = currentScreen(); setScreen(next); if (next !== 'main') setAnalyticsOpen(false); cancelParse() }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [cancelParse])
  return (
    <div className={`app-shell app-shell--map min-h-dvh text-text ${!mapVisible && mapOpen ? 'app-shell--workspace' : ''} ${selection ? 'has-selection' : ''} ${(hasResult && mapOpen) || activeAnalysis ? 'has-result' : ''} ${!mapOpen ? 'app-shell--files' : ''} ${activeAnalysis ? 'app-shell--analytics' : ''}`}
      data-motion={motion.running ? 'running' : 'paused'} data-quality={economy ? 'economy' : 'adaptive'}>
      <a className="skip-link" href={`#${screen}`}>{ru.app.skipToContent}</a>
      <div className="map-stage" data-visible={sceneVisible} inert={!sceneVisible} aria-hidden={!sceneVisible || undefined}>
        {(sceneVisible || (warmMap && !economy)) && <MapScene selection={selection} onReset={reset} visible={sceneVisible} paused={paused || !sceneVisible} onToggleMotion={() => setPaused((value) => !value)} motion={motion} economy={economy} onSlow={onSlow}
          viewKey={parseState.status === 'ready' ? parseState.revision : -1} onViewReady={demo.onViewReady} onReadyChange={onMapReady} hudLabel={activeAnalysis ? ru.analytics.status(fileState.source!.name) : demoLabel(demo.state)} flightPaused={demo.state.paused}
          analysis={activeAnalysis} onRegionSelect={showRegion} />}
      </div>
      <header className="app-header flex items-center justify-between gap-4">
        <div className="flex items-center gap-3" aria-label={ru.app.title}>
          <svg className="brand-symbol" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M20 5C12 5 7 11 7 18c0 9 13 20 13 20s13-11 13-20C33 11 28 5 20 5Z" />
            <circle cx="20" cy="18" r="4" />
          </svg>
          <span className="flex flex-col gap-0.5">
            <span className="brand-word text-base font-bold tracking-[0.22em]">{ru.app.wordmark}</span>
            <span className="brand-suffix font-mono text-[10px] tracking-[0.23em]">{ru.app.wordmarkSuffix}</span>
          </span>
        </div>
        <span className="app-partnership font-mono">{ru.app.partnership}</span>
        <nav className="app-navigation" aria-label={ru.files.navigation}>
          <button type="button" className="map-toggle" aria-pressed={mapVisible} aria-keyshortcuts="M" aria-label={mapVisible ? 'Скрыть карту' : 'Показать карту'} title="Карта · M" data-demo-control="" onClick={toggleMap}>Карта</button>
          <ThemeToggle />
          <button type="button" className="demo-start" data-demo-control="" title={ru.demo.startHint} aria-keyshortcuts="Shift+D" aria-pressed={demo.active}
            onClick={demo.active ? demo.stop : demo.start}>{ru.demo.start}</button>
          <a href={filesOpen ? '#main' : '#files'} title={filesOpen ? ru.files.back : ru.files.nav}>
            <span className="nav-full">{filesOpen ? ru.files.back : ru.files.nav}</span><span className="nav-short">{filesOpen ? ru.files.backShort : ru.files.navShort}</span><span className="nav-arrow" aria-hidden="true">↗</span></a>
          <a className="nav-about" href={aboutOpen ? '#main' : '#about'} aria-label={aboutOpen ? ru.files.back : ru.about.title} title={aboutOpen ? ru.files.back : ru.about.title}>
            <span className="nav-full">{aboutOpen ? ru.files.back : ru.about.title}</span><span className="nav-about-icon" aria-hidden="true">{aboutOpen ? '←' : 'i'}</span></a>
        </nav>
      </header>

      <main id="main" className="map-hero" tabIndex={-1} hidden={!mapOpen}>
        {activeAnalysis ? <div className="analytics-heading">
          <div><p className="analytics-file font-mono" role="status" title={fileState.source!.name}>{ru.analytics.status(fileState.source!.name)}</p><h1>{ru.analytics.title}</h1><p className="analytics-hint">{mapVisible ? ru.analytics.hint : 'Выберите регион в списке, чтобы открыть его адреса.'}</p></div>
          <button className="file-button" onClick={exitAnalysis}>{ru.analytics.exit}</button>
        </div> : <>
        <div className="hero-content">
          <p className="hero-eyebrow font-mono text-neon">{ru.map.countryLabel}</p>
          <h1 className="hero-title font-semibold">{ru.app.title}</h1>
          <p className="hero-subtitle text-muted">{ru.app.subtitle}</p>
        </div>
        <Search selection={selection} onSelect={choosePlace} onReset={reset} query={query} onQuery={changeQuery}
          places={places} parseState={parseState} onParse={parseAddress} onCancel={cancelParse} lookupFailed={hasResult && resultLocation.note === 'notFound'} motionRunning={motion.running} mapVisible={mapVisible} />
        <DemoControls state={demo.state} onPause={demo.togglePause} onStop={demo.stop} onStart={demo.start} />
        </>}
      </main>
      {activeAnalysis && <AnalyticsPanel analysis={activeAnalysis} fileName={fileState.source!.name} inline={!mapVisible} onRegion={showRegion} onClose={exitAnalysis} />}
      {mapOpen && parseState.status === 'ready' && <ResultPanel key={parseState.revision} inline={!mapVisible} item={parseState.item} location={resultLocation} onClose={closeResult} />}
      <div className="map-coverage font-mono" hidden={!sceneVisible}><span className="country-dot" /><span>{ru.map.regionCount}</span><span>{ru.map.regionDetail}</span></div>
      {aboutOpen && <AboutScreen places={places} />}
      <FileScreen active={filesOpen} session={fileSession} analysis={analysis} regionFilter={regionFilter} onRegionFilter={setRegionFilter}
        onShowMap={openAnalysis} geoStatus={places.status} onRetryGeo={places.retry} geo={places.data} />
    </div>
  )
}
