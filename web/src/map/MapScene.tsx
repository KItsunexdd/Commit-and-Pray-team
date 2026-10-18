import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { ru } from '../i18n/ru'
import { loadMapData } from './data'
import type { MapData, RegionInfo } from './data'
import type { Place } from '../search/places'
import type { MapController } from './controller'
import { afterMapPaint, delayMapPreview, revealMapOnIdle } from './loading'
import { Hud } from './Hud'
import type { MapStatus, MapTelemetry } from './Hud'
import { EffectsCanvas } from '../effects/EffectsCanvas'
import { useFrameRateGuard } from '../effects/useFrameRateGuard'
import { createSurface } from '../effects/contour'
import type { useMotionSettings } from '../effects/useMotionSettings'
import './map.css'
import type { Analysis } from '../analytics/model'
import { handoffRequest } from './handoff'
import type { MapRequest } from './handoff'

export function MapScene({ selection, onReset, active = true, visible = true, paused, onToggleMotion, motion, economy, onSlow,
  viewKey = -1, onViewReady, onReadyChange, hudLabel = '', flightPaused = false, analysis = null, onRegionSelect }: {
  selection: Place | null; onReset: () => void; active?: boolean; visible?: boolean; paused: boolean; onToggleMotion: () => void
  motion: ReturnType<typeof useMotionSettings>; economy: boolean; onSlow: () => void
  viewKey?: number; onViewReady?: (key: number) => void; hudLabel?: string; flightPaused?: boolean
  onReadyChange?: (ready: boolean) => void
  analysis?: Analysis | null; onRegionSelect?: (id: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const contours = useRef<SVGSVGElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const controllerRef = useRef<MapController | null>(null)
  const selectionRef = useRef(selection)
  const pauseRef = useRef(paused)
  const viewRef = useRef(viewKey)
  const readyRef = useRef(onViewReady)
  const flightPauseRef = useRef(flightPaused)
  const visibleRef = useRef(visible)
  const analysisRef = useRef(analysis)
  const regionSelectRef = useRef(onRegionSelect)
  const economyRef = useRef(economy)
  const dataRef = useRef<MapData | null>(null)
  const previewRef = useRef<SVGSVGElement | null>(null)
  const upgradingRef = useRef(false)
  const queuedRef = useRef<MapRequest | null>(null)
  const usableRef = useRef(false)
  const mapReadyRef = useRef(onReadyChange)
  const statusRef = useRef<MapStatus>('loading')
  const [surface] = useState(createSurface)
  const [status, setStatus] = useState<MapStatus>('loading')
  const [regions, setRegions] = useState<RegionInfo[]>([])
  const [telemetry, setTelemetry] = useState<MapTelemetry | null>(null)
  const [retry, setRetry] = useState(0)
  const [fallback, setFallback] = useState(false)
  const svgMode = fallback || !active
  const available = ['ready', 'flying', 'returning', 'found', 'cityFound'].includes(status)
  useFrameRateGuard(visible && available && !economy && !motion.hidden && !motion.reduced && !paused, onSlow)

  useLayoutEffect(() => {
    visibleRef.current = visible
    controllerRef.current?.suspend(!visible || flightPauseRef.current)
    controllerRef.current?.display?.(visible)
    controllerRef.current?.motion(!visible || pauseRef.current || upgradingRef.current)
    if (visible && queuedRef.current && !upgradingRef.current && controllerRef.current) {
      const request = queuedRef.current; queuedRef.current = null
      controllerRef.current.select(request.place, 0)
    }
  }, [visible])
  useEffect(() => { pauseRef.current = paused; controllerRef.current?.motion(paused || upgradingRef.current || !visibleRef.current) }, [paused])
  useEffect(() => { economyRef.current = economy; controllerRef.current?.quality?.(economy) }, [economy])
  useEffect(() => { readyRef.current = onViewReady }, [onViewReady])
  useEffect(() => { mapReadyRef.current = onReadyChange }, [onReadyChange])
  useEffect(() => { flightPauseRef.current = flightPaused; controllerRef.current?.suspend(flightPaused || !visibleRef.current) }, [flightPaused])
  useEffect(() => { regionSelectRef.current = onRegionSelect }, [onRegionSelect])
  useEffect(() => {
    analysisRef.current = analysis
    controllerRef.current?.analysis(analysis?.regions ?? null, id => regionSelectRef.current?.(id))
  }, [analysis])

  useEffect(() => {
    const changed = selectionRef.current !== selection
    selectionRef.current = selection
    viewRef.current = viewKey
    if (!active) return
    if (changed) {
      const request = { place: selection, duration: 2400 }
      if (!visibleRef.current || upgradingRef.current || !controllerRef.current) queuedRef.current = request
      else controllerRef.current.select(selection, request.duration)
    } else if (usableRef.current && ['ready', 'found', 'cityFound'].includes(statusRef.current)) readyRef.current?.(viewKey)
  }, [selection, active, viewKey])

  // Ресайз и снижение качества обслуживает контроллер без замены холста и слоёв.
  useEffect(() => {
    const container = host.current!
    const labels = overlay.current!
    const svg = contours.current!
    const abort = new AbortController()
    let disposed = false
    let map: MapLibreMap | undefined
    let webgl: HTMLDivElement | undefined
    let fadeTimer = 0
    let upgradeTimer = 0
    let stopWaiting: (() => void) | undefined
    let revealed = false
    let nextStatus: MapStatus = 'ready'
    let svgStatus: MapStatus = 'loading'
    let previewVisible = svgMode || !!previewRef.current
    container.dataset.previewVisible = String(previewVisible)
    container.inert = !previewVisible
    container.setAttribute('aria-hidden', String(!previewVisible))
    labels.dataset.ready = 'false'
    usableRef.current = false
    mapReadyRef.current?.(false)
    const retainSvg = () => {
      const current = container.querySelector<SVGSVGElement>('.map-svg:not(.map-preview)')
      if (current) {
        previewRef.current?.remove()
        const preview = current.cloneNode(true) as SVGSVGElement
        preview.classList.add('map-preview')
        preview.removeAttribute('tabindex')
        preview.setAttribute('aria-hidden', 'true')
        container.prepend(preview)
        previewRef.current = preview
      }
      const preview = previewRef.current
      if (preview) { preview.removeAttribute('hidden'); delete preview.dataset.fading; container.dataset.renderer = 'svg' }
      else delete container.dataset.renderer
    }
    const reportStatus = (next: MapStatus) => {
      statusRef.current = next
      setStatus(next)
      const settled = ['ready', 'found', 'cityFound'].includes(next)
      if (usableRef.current) {
        mapReadyRef.current?.(settled)
        if (settled) readyRef.current?.(viewRef.current)
      }
    }
    const stopPreviewTimer = delayMapPreview(() => {
      if (disposed || revealed) return
      previewVisible = true; container.dataset.previewVisible = 'true'
      container.inert = false; container.removeAttribute('aria-hidden')
      if (!upgradingRef.current) { labels.dataset.ready = 'true'; reportStatus(svgStatus) }
    })
    if (!previewVisible) reportStatus('loading')
    const timeout = window.setTimeout(() => { abort.abort(); if (!disposed) setStatus('error') }, 20000)
    async function initialize() {
      try {
        // Предзагруженный модуль запускается после первого кадра интерфейса,
        // параллельно с геоданными, без ожидания SVG или свободного времени.
        const engine = svgMode ? null : afterMapPaint(abort.signal, false).then(() => import('./engine')).then(lib => ({ lib }), () => ({ lib: null }))
        const [data, { createSvgController }] = await Promise.all([dataRef.current ?? loadMapData(abort.signal), import('./svg-controller')])
        if (disposed) return
        dataRef.current = data
        setRegions(data.directory)
        // Ждём только появления HTML-подписей; геометрия не зависит от шрифтов.
        await afterMapPaint(abort.signal, false)
        if (disposed) return
        clearTimeout(timeout)
        controllerRef.current = createSvgController(data, container, labels, svg, next => {
          svgStatus = next
          if (previewVisible) reportStatus(next)
        }, setTelemetry, surface)
        controllerRef.current.motion(pauseRef.current || !visibleRef.current)
        controllerRef.current.suspend(flightPauseRef.current || !visibleRef.current)
        controllerRef.current.display?.(visibleRef.current)
        controllerRef.current.analysis(analysisRef.current?.regions ?? null, id => regionSelectRef.current?.(id))
        usableRef.current = svgMode
        const initial = queuedRef.current
        queuedRef.current = null
        controllerRef.current.select(initial?.place ?? selectionRef.current, initial?.duration ?? 0)
        previewRef.current?.remove(); previewRef.current = null
        labels.dataset.ready = String(previewVisible)
        container.dataset.renderer = 'svg'
        void document.fonts.ready.then(() => { if (!disposed) controllerRef.current?.refreshLabels?.() })
        if (svgMode) return

        const lib = (await engine)?.lib
        if (disposed) return
        if (!lib) { setFallback(true); return }
        lib.setWorkerUrl(lib.workerUrl)
        const economy = economyRef.current, compact = container.clientWidth < 640
        const lowDetail = compact || economy
        lib.setWorkerCount(economy ? 1 : 2)
        webgl = document.createElement('div')
        webgl.className = 'map-webgl'
        webgl.setAttribute('aria-hidden', 'true')
        webgl.inert = true
        container.append(webgl)
        const switchToSvg = () => { if (!disposed) setFallback(true) }
        upgradeTimer = window.setTimeout(switchToSvg, 20000)
        try {
          map = new lib.Map({
            container: webgl, style: lib.createMapStyle(data, lowDetail), center: [67, 48], zoom: 3,
            pitch: 44, bearing: -7, maxPitch: 55, minZoom: 1.6, maxZoom: 11,
            renderWorldCopies: false, attributionControl: false,
            trackResize: false,
            pixelRatio: Math.min(devicePixelRatio, economy ? 1 : compact ? 1.5 : 2),
            // MSAA нельзя выключить у существующего контекста. Контур сглаживает SVG;
            // отключаем MSAA сразу, чтобы смена качества не пересоздавала карту.
            canvasContextAttributes: { antialias: false },
            transformRequest: (url) => {
              if (new URL(url, location.href).origin !== location.origin) throw new Error(ru.map.externalResource)
              return { url }
            },
          })
        } catch { switchToSvg(); return }
        map.getCanvas().setAttribute('aria-label', ru.map.accessibleName)
        map.on('load', () => {
          if (disposed || !map || !webgl) return
          const hadFocus = container.contains(document.activeElement)
          controllerRef.current?.suspend(true)
          const view = controllerRef.current?.capture?.()
          retainSvg()
          controllerRef.current?.dispose()
          upgradingRef.current = true
          labels.dataset.ready = 'false'
          controllerRef.current = lib.createMapController(map, data, container, labels, svg, next => {
            nextStatus = next; if (revealed) reportStatus(next)
          }, setTelemetry, surface, economyRef.current, lowDetail)
          // Фоновое вращение не должно мешать первому idle.
          controllerRef.current.motion(true)
          controllerRef.current.analysis(analysisRef.current?.regions ?? null, id => regionSelectRef.current?.(id))
          if (view) {
            controllerRef.current.restore?.(view)
            nextStatus = view.selection ? view.selection.region.kind === 'city' ? 'cityFound' : 'found' : 'ready'
          }
          else controllerRef.current.select(selectionRef.current, 0)
          stopWaiting = revealMapOnIdle(map, container, () => {
            if (disposed || !webgl) return
            clearTimeout(upgradeTimer)
            stopPreviewTimer()
            revealed = true; upgradingRef.current = false; usableRef.current = true
            webgl.dataset.ready = 'true'
            webgl.inert = false
            webgl.removeAttribute('aria-hidden')
            if (hadFocus) map?.getCanvas().focus({ preventScroll: true })
            container.dataset.renderer = 'webgl'
            container.inert = false; container.removeAttribute('aria-hidden')
            mapRef.current = map ?? null
            labels.dataset.ready = 'true'
            controllerRef.current?.activate?.()
            controllerRef.current?.suspend(flightPauseRef.current || !visibleRef.current)
            controllerRef.current?.display?.(visibleRef.current)
            controllerRef.current?.motion(pauseRef.current || !visibleRef.current)
            const request = view ? handoffRequest(view, queuedRef.current) : queuedRef.current
            queuedRef.current = null
            if (request && request.duration > 0) controllerRef.current?.select(request.place, request.duration)
            else reportStatus(nextStatus)
            const preview = previewRef.current
            if (preview) {
              preview.dataset.fading = 'true'
              fadeTimer = window.setTimeout(() => { preview.setAttribute('hidden', '') }, 450)
            }
          })
        })
        map.on('error', switchToSvg)
        map.on('webglcontextlost', switchToSvg)
      } catch {
        // Ошибка необязательного 3D-модуля оставляет рабочую SVG-карту.
        if (!disposed) {
          if (controllerRef.current) setFallback(true)
          else setStatus('error')
        }
      }
    }
    void initialize()
    return () => {
      disposed = true
      clearTimeout(timeout)
      clearTimeout(upgradeTimer)
      clearTimeout(fadeTimer)
      stopPreviewTimer()
      abort.abort()
      stopWaiting?.()
      retainSvg()
      upgradingRef.current = false
      usableRef.current = false
      mapReadyRef.current?.(false)
      controllerRef.current?.dispose()
      controllerRef.current = null
      map?.remove()
      webgl?.remove()
      mapRef.current = null
      labels.dataset.ready = 'false'
      surface.update('', '', null)
      svg.querySelectorAll('path').forEach(path => path.removeAttribute('d'))
    }
  }, [retry, surface, svgMode])
  const reset = () => { onReset(); if (!selection) controllerRef.current?.select(null) }
  const zoom = (direction: 'zoomIn' | 'zoomOut') => {
    controllerRef.current?.interact()
    controllerRef.current?.zoom?.(direction)
    mapRef.current?.[direction]({ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 })
  }

  return (
    <>
      <div className="map-atmosphere" aria-hidden="true"><div className="map-grid" />
        <svg className="map-arcs" viewBox="0 0 1440 900" preserveAspectRatio="none">
          {[0, 26, 52, 78, 104].map(offset => <g key={offset} transform={`translate(0,${offset})`}>
            <path d="M990 -150 Q1080 70 1500 190M-70 590 Q50 840 620 970" />
          </g>)}<path className="green" d="M1020 -150 Q1110 120 1500 240M-70 660 Q40 900 620 1010" />
        </svg>
      </div>
      <div className="map-host" ref={host} />
      <EffectsCanvas surface={surface} motion={motion} economy={economy} enabled={visible && !economy} />
      <div className="map-overlays" ref={overlay} aria-hidden="true">
        <svg className="map-contours" ref={contours}>
          <path className="map-borders" data-borders="" />
          <path id="country-contour" className="map-country" data-country="" />
          <use href="#country-contour" className="map-country-halo" />
          <path id="selected-contour" className="map-selected-contour" data-selected-region="" />
          <use href="#selected-contour" className="map-selected-halo" />
        </svg>
        {regions.map((region) => {
          const count = analysis?.regions.find(item => item.id === region.id)?.count ?? 0
          return (
          <div key={region.id} data-city={region.id} className={`map-city ${region.kind === 'city' || ['KZ-15', 'KZ-23', 'KZ-63'].includes(region.id) ? 'map-city--major' : ''} ${region.id === 'KZ-71' ? 'map-city--capital' : ''}`}>
            <span className="map-city-dot" /><span className="map-city-name">{region.center.name.toLocaleUpperCase('ru')}</span>
            {count > 0 && <span className="map-city-count" data-region-count={region.id}>{count}</span>}
          </div>
        )})}
        <div className="map-city map-city--selected" data-selected-city=""><span className="map-city-rays" /><span className="map-city-dot" /><span className="map-city-name" /></div>
        <div className="map-target-frame" data-target-frame=""><i /><i /><i /><i /></div>
      </div>
      <Hud status={status} telemetry={telemetry} paused={paused || flightPaused} label={hudLabel} />
      <p className="sr-only" role="status">{ru.map.status[status]}</p>
      {status === 'loading' && <div className="map-loading font-mono" aria-hidden="true"><i />{ru.map.loading}</div>}
      {fallback && available && <p className="sr-only">{ru.map.fallback}</p>}
      {(status === 'error' || status === 'unsupported') && (
        <div className="map-notice" role="alert">
          <p>{status === 'unsupported' ? ru.map.unsupported : ru.map.loadError}</p>
          <button onClick={() => { setStatus('loading'); setRetry((value) => value + 1) }}>{ru.map.retry}</button>
        </div>
      )}
      {selection && <div className="map-selection" aria-live="polite">
        <p className="map-selection-kind font-mono">{selection.region.kind === 'city' ? ru.search.cityLabel : ru.search.regionLabel}</p>
        <strong>{selection.region.name_ru}</strong>
        {selection.region.kind !== 'city' && <p>{ru.search.center}: {selection.region.center.name}{selection.city && selection.city.name !== selection.region.center.name ? ` · ${ru.search.city}: ${selection.city.name}` : ''}</p>}
        <button onClick={reset}>{ru.search.reset}<span aria-hidden="true">↗</span></button>
      </div>}
      <div className="map-controls" aria-label={ru.map.controls}>
        <button disabled={!available} onClick={() => zoom('zoomIn')} aria-label={ru.map.zoomIn}>+</button>
        <button disabled={!available} onClick={() => zoom('zoomOut')} aria-label={ru.map.zoomOut}>−</button>
        <button disabled={!available} onClick={reset} aria-label={ru.map.reset} title={ru.map.reset}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><circle cx="12" cy="12" r="3" /></svg></button>
        <button className="map-motion-toggle" onClick={onToggleMotion} aria-label={paused ? ru.map.resume : ru.map.pause} aria-pressed={paused} title={paused ? ru.map.resume : ru.map.pause}>{paused ? '▷' : 'Ⅱ'}</button>
      </div>
      <div className="map-attribution">{ru.app.osmAttribution}</div>
    </>
  )
}
