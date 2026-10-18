import type { AddressResult } from '../api/types'
import type { FileRow } from '../files/document'
import type { RegionInfo } from '../map/data'
import type { CityInfo } from '../search/places'
import { palettes } from '../theme/palette'
import type { Theme } from '../theme/palette'

export const unassignedRegion = 'unassigned'
export const analysisColors = Array.from({ length: 5 }, (_, i) => palettes.light[`analysis-${i}` as 'analysis-0'])
export const zeroColor = palettes.light['analysis-zero']
export const unknownColor = palettes.light['analysis-unknown']
export interface RegionCount { id: string; name: string; count: number; color: string }
export interface Count { name: string; count: number; key: string }
export interface Analysis {
  total: number; confident: number; located: number; unknown: number
  apartments: number; automaticBoth: number; edited: number; missingCity: number
  rowRegions: string[]; regions: RegionCount[]; topRegions: RegionCount[]; topCities: Count[]
  histogram: number[]; scale: { min: number; max: number; color: string }[]
}

const present = (value: string | null) => !!value?.trim()
const nameKey = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
const cityKey = (value: string) => nameKey(value).replace(/^(?:город|г|city)\s+/, '').replace(/\s+(?:қаласы|каласы|city)$/, '')

export function createRegionIndex(regions: RegionInfo[], cities: CityInfo[]) {
  const byName = new Map<string, Set<string>>()
  const byCity = new Map<string, Set<CityInfo>>()
  const regionIds = new Set(regions.map(region => region.id))
  for (const region of regions) for (const name of [region.name_ru, ...region.aliases]) {
    const key = nameKey(name)
    if (!byName.has(key)) byName.set(key, new Set())
    byName.get(key)!.add(region.id)
  }
  for (const city of cities) for (const name of [city.name, city.name_kz, city.name_en, ...city.aliases]) {
    if (!name || !regionIds.has(city.region_id)) continue
    const key = cityKey(name)
    if (!byCity.has(key)) byCity.set(key, new Set())
    byCity.get(key)!.add(city)
  }
  return (result: Pick<AddressResult, 'province' | 'city'>) => {
    const province = result.province?.trim() ?? ''
    const provinceIds = byName.get(nameKey(province))
    const provinceId = provinceIds?.size === 1 ? [...provinceIds][0]! : null
    const candidates = [...(byCity.get(cityKey(result.city ?? '')) ?? [])]
      .filter(city => !provinceId || city.region_id === provinceId)
    const city = candidates.length === 1 ? candidates[0]! : null
    // Непустую, но неизвестную область не подменяем догадкой по городу.
    return { regionId: province ? provinceId : city?.region_id ?? null, city }
  }
}

export function summarizeFile(rows: readonly FileRow[], regions: RegionInfo[], cities: CityInfo[], theme: Theme = 'light'): Analysis {
  const palette = palettes[theme]
  const locate = createRegionIndex(regions, cities)
  const counts = new Map(regions.map(region => [region.id, 0]))
  const cityCounts = new Map<string, Count>()
  const histogram = [0, 0, 0, 0, 0]
  const rowRegions: string[] = []
  let confident = 0, unknown = 0, apartments = 0, automaticBoth = 0, edited = 0, missingCity = 0
  for (const row of rows) {
    const { result } = row.item, original = row.original
    const { regionId, city } = locate(result)
    rowRegions.push(regionId ?? unassignedRegion)
    if (regionId) counts.set(regionId, counts.get(regionId)! + 1)
    else unknown++
    if (present(result.city)) {
      const name = city?.name ?? result.city!.trim()
      const key = city ? `${city.region_id}:${cityKey(city.name)}` : `raw:${cityKey(name)}`
      const previous = cityCounts.get(key)
      cityCounts.set(key, { key, name, count: (previous?.count ?? 0) + 1 })
    } else missingCity++
    if (original.confidence >= .6) confident++
    const bucket = Math.min(4, Math.floor(original.confidence * 5))
    histogram[bucket] = histogram[bucket]! + 1
    if (present(original.apartment)) {
      apartments++
      if (present(original.entrance)) automaticBoth++
    }
    if (row.edited.length) edited++
  }
  const limit = Math.max(5, ...counts.values())
  const scale = analysisColors.map((_, index) => ({ min: Math.ceil(index * limit / 5) + 1, max: Math.ceil((index + 1) * limit / 5), color: palette[`analysis-${index}` as 'analysis-0'] }))
  const regionCounts = regions.map(region => {
    const count = counts.get(region.id)!
    return { id: region.id, name: region.name_ru, count, color: count ? scale.find(step => count <= step.max)!.color : palette['analysis-zero'] }
  })
  const rank = (a: { count: number; name: string }, b: { count: number; name: string }) => b.count - a.count || a.name.localeCompare(b.name, 'ru')
  return { total: rows.length, confident, located: rows.length - unknown, unknown, apartments, automaticBoth, edited, missingCity,
    rowRegions, regions: regionCounts, topRegions: regionCounts.filter(region => region.count).sort(rank).slice(0, 5),
    topCities: [...cityCounts.values()].sort(rank).slice(0, 5), histogram, scale }
}

export function percentage(count: number, total: number) { return total ? Math.round(count / total * 1000) / 10 : 0 }
export function filePositions(rows: readonly FileRow[], needsReview: boolean, regionFilter: string | null, rowRegions: readonly string[]) {
  return rows.flatMap((row, index) => (!needsReview || row.item.result.confidence < .6)
    && (regionFilter === null || rowRegions[index] === regionFilter) ? [index] : [])
}
