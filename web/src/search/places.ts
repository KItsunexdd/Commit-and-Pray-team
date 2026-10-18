import type { RegionInfo } from '../map/data'

export interface CityInfo {
  name: string
  name_kz: string | null
  name_en: string | null
  aliases: string[]
  region_id: string
  province: string
  population: number
  lat: number
  lon: number
}

export interface Place {
  key: string
  name: string
  region: RegionInfo
  city: CityInfo | null
}

interface IndexedPlace { place: Place; names: string[]; population: number }

export function normalize(value: string): string {
  const letters: Record<string, string> = { ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и', ё: 'е' }
  return value.toLocaleLowerCase('ru').replace(/[әғқңөұүһіё]/g, (letter) => letters[letter]!)
    .normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function cityName(value: string): string {
  return normalize(value).replace(/^(?:город|г|city)\s+/, '').replace(/\s+(?:каласы|city)$/, '')
}

export function indexPlaces(regions: RegionInfo[], cities: CityInfo[]): IndexedPlace[] {
  const byId = new Map(regions.map((region) => [region.id, region]))
  const places: IndexedPlace[] = []
  cities.forEach((city, index) => {
    const region = byId.get(city.region_id)
    if (!region) return
    const variants = [city.name, city.name_kz, city.name_en, ...city.aliases]
    if (region.kind === 'city') variants.push(region.name_ru, region.name_kz, region.name_en, ...region.aliases)
    places.push({ place: { key: `city-${index}`, name: city.name, region, city },
      names: [...new Set(variants.filter((name): name is string => !!name).map(cityName))], population: city.population || 0 })
  })
  for (const region of regions.filter((region) => region.kind === 'oblast')) {
    places.push({ place: { key: region.id, name: region.name_ru, region, city: null },
      names: [...new Set([region.name_ru, region.name_kz, region.name_en, ...region.aliases].filter(Boolean).map(normalize))], population: 0 })
  }
  return places
}

// Расстояние учитывает вставку, удаление, замену и перестановку соседних букв.
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i])
  rows[0] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1
    rows[i]![j] = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
      rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1)
    }
  }
  return rows[a.length]![b.length]!
}

export function findPlaces(index: IndexedPlace[], input: string, limit = 6): Place[] {
  const query = cityName(input)
  if (!query || query.length > 90 || /\d/.test(query)) return []
  const tolerance = query.length < 4 ? 0 : query.length < 8 ? 1 : 2
  return index.map((item) => {
    let score = Infinity
    for (const name of item.names) {
      if (name === query) { score = 0; break }
      if (name.startsWith(query)) score = Math.min(score, 10 + (name.length - query.length) / 100)
      else if (query.length >= 3 && name.split(' ').some((word) => word.startsWith(query))) score = Math.min(score, 20 + name.length / 100)
      else if (tolerance && Math.abs(name.length - query.length) <= tolerance) {
        const edits = distance(query, name)
        if (edits <= tolerance) score = Math.min(score, 30 + edits)
      }
    }
    return { ...item, score }
  }).filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score || b.population - a.population || a.place.name.localeCompare(b.place.name, 'ru'))
    .slice(0, limit).map(({ place }) => place)
}
