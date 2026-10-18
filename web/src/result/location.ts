import type { AddressResult } from '../api/types'
import type { RegionInfo } from '../map/data'
import type { CityInfo, Place } from '../search/places'
import { normalize } from '../search/places'

export interface AddressLocation { place: Place | null; note: 'regionOnly' | 'notFound' | 'unavailable' | null }
const cityKey = (value: string | null | undefined) => normalize(value ?? '').replace(/^(?:город|г|city)\s+/, '').replace(/\s+(?:каласы|city)$/, '')

export function locateAddress(result: AddressResult, regions: RegionInfo[], cities: CityInfo[]): AddressLocation {
  const province = cityKey(result.province ?? '')
  const cityName = cityKey(result.city ?? '')
  let region = province ? regions.find((region) => [region.name_ru, region.name_kz, region.name_en, ...region.aliases].some((name) => cityKey(name) === province)) : undefined
  const matches = cityName ? cities.filter((city) => [city.name, city.name_kz, city.name_en, ...city.aliases].some((name) => cityKey(name) === cityName)) : []
  const regionId = region?.id
  const candidates = regionId ? matches.filter((city) => city.region_id === regionId) : matches
  const city = candidates.length === 1 ? candidates[0]! : null
  region ??= city ? regions.find((region) => region.id === city.region_id) : undefined
  if (!region) return { place: null, note: 'notFound' }
  return { place: { key: `address-${region.id}`, name: city?.name ?? region.name_ru, region, city }, note: cityName && !city ? 'regionOnly' : null }
}
