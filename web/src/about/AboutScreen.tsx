import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { metricFields } from '../api/info'
import type { ServiceInfo } from '../api/info'
import type { usePlaces } from '../search/usePlaces'
import { ru } from '../i18n/ru'
import { interfaceCounts } from './model'
import './about.css'

export function AboutScreen({ places }: { places: ReturnType<typeof usePlaces> }) {
  const title = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; info: ServiceInfo | null }>({ status: 'loading', info: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${ru.about.title} — ${ru.app.title}`
    title.current?.focus({ preventScroll: true })
    return () => { document.title = previousTitle }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void api.info(controller.signal).then(info => {
      if (!controller.signal.aborted) setState({ status: 'ready', info })
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error', info: null }) })
    return () => controller.abort()
  }, [attempt])
  const { info, status } = state
  const sources = info?.gazetteer.sources ?? [{ name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', date: null }]
  const counts = info?.gazetteer.counts ?? (places.data ? interfaceCounts(places.data) : null)
  const labels: Record<string, string> = ru.about.counts
  return <main id="about" className="file-screen about-screen" tabIndex={-1}>
    <div className="file-intro"><p className="file-eyebrow">{ru.about.eyebrow}</p>
      <h1 ref={title} tabIndex={-1}>{ru.about.title}</h1><p>{ru.about.subtitle}</p></div>
    <section className="about-card about-process" aria-labelledby="about-process-title">
      <div className="about-section-title"><span aria-hidden="true">01</span><h2 id="about-process-title">{ru.about.how}</h2></div>
      <p className="about-note">{ru.about.principle}</p>
      <ol className="about-steps">{ru.about.steps.map((step, index) => <li key={step.title}>
        <span className="about-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <h3>{step.title}</h3><p>{step.description}</p><code>{step.example}</code>
      </li>)}</ol>
      <p className="about-example-note">{ru.about.exampleNote}</p>
    </section>
    <div className="about-grid">
      <section className="about-card" aria-labelledby="about-sources-title" aria-busy={status === 'loading'}>
        <div className="about-section-title"><span aria-hidden="true">02</span><h2 id="about-sources-title">{ru.about.sources}</h2></div>
        <p className={`about-status ${status === 'error' ? 'about-status--fallback' : ''}`} role="status">
          {status === 'loading' ? ru.about.loading : status === 'error' ? ru.about.fallback : ru.about.server(info!.version)}
        </p>
        {status !== 'loading' && <>
          {sources.length ? <ul className="about-sources">{sources.map((source, index) => <li key={index}>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}<span aria-hidden="true"> ↗</span></a> : <strong>{source.name}</strong>}
            {source.date && <span className="about-note">{ru.about.sourceDate}: {source.date}</span>}
          </li>)}</ul> : <p className="about-note">{ru.about.noSources}</p>}
          {counts ? <dl className="about-counts">{Object.entries(counts).map(([key, count]) => <div key={key}>
            <dt>{labels[key] ?? key}</dt><dd>{count.toLocaleString('ru-RU')}</dd>
          </div>)}</dl> : <p className="about-note" role="status">{places.status === 'error' ? ru.about.geoError : ru.about.geoLoading}</p>}
          {counts && !Object.keys(counts).length && <p className="about-note">{ru.about.noCounts}</p>}
          {!info && <p className="about-note">{ru.about.localHint}</p>}
        </>}
        <div className="about-actions">
          {status === 'error' && <button className="file-button" onClick={() => { setState({ status: 'loading', info: null }); setAttempt(value => value + 1) }}>{ru.about.retry}</button>}
          {status === 'error' && places.status === 'error' && <button className="file-button" onClick={places.retry}>{ru.about.retryGeo}</button>}
        </div>
      </section>
      <section className="about-card" aria-labelledby="about-quality-title">
        <div className="about-section-title"><span aria-hidden="true">03</span><h2 id="about-quality-title">{ru.about.quality}</h2></div>
        {status === 'loading' ? <p className="about-note">{ru.about.loading}</p> : info?.metrics.length ? <>
          <p className="about-note">{ru.about.metricsHint}</p>
          <div className="about-table-wrap" tabIndex={0} role="region" aria-label={ru.about.quality}>
            <table className="about-metrics"><caption className="sr-only">{ru.about.quality}</caption><thead><tr>
              <th scope="col">{ru.about.version}</th>{metricFields.map(field => <th scope="col" key={field}>{field}</th>)}
            </tr></thead><tbody>{info.metrics.map((row, index) => <tr key={index}>
              <th scope="row">{row.version}</th>{metricFields.map(field => <td key={field}>{String(row[field])}</td>)}
            </tr>)}</tbody></table>
          </div>
        </> : <p className="about-empty-metrics">{ru.about.noMetrics}</p>}
      </section>
    </div>
    <section className="about-card about-licenses" aria-labelledby="about-licenses-title">
      <div className="about-section-title"><span aria-hidden="true">04</span><h2 id="about-licenses-title">{ru.about.licenses}</h2></div>
      <div><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap · ODbL 1.0 ↗</a><span>{ru.app.osmAttribution}</span></p>
        <p><a href="/licenses/maplibre-gl.txt" target="_blank" rel="noreferrer">MapLibre GL JS · BSD 3-Clause ↗</a><span>{ru.about.mapLicense}</span></p></div>
    </section>
    <p className="file-attribution">{ru.app.osmAttribution}</p>
  </main>
}
