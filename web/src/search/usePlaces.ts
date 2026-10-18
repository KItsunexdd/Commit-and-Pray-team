import { useEffect, useState } from 'react'
import { localJson } from '../map/data'
import type { RegionInfo } from '../map/data'
import { indexPlaces } from './places'
import type { CityInfo } from './places'

export function usePlaces() {
  const [data, setData] = useState<{ regions: RegionInfo[]; cities: CityInfo[]; index: ReturnType<typeof indexPlaces> } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([localJson<RegionInfo[]>('kz-regions.json', controller.signal), localJson<CityInfo[]>('kz-cities.json', controller.signal)])
      .then(([regions, cities]) => { if (!controller.signal.aborted) { setData({ regions, cities, index: indexPlaces(regions, cities) }); setStatus('ready') } })
      .catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [attempt])
  return { data, status, retry: () => { setStatus('loading'); setAttempt((value) => value + 1) } }
}
