import type { RegionInfo } from '../map/data'
import type { CityInfo } from '../search/places'

export function interfaceCounts(data: { regions: RegionInfo[]; cities: CityInfo[] }) {
  return { regions: data.regions.length, cities: data.cities.length }
}
