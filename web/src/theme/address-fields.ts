import type { AddressField } from '../api/types'

export const fieldColors = {
  province: 'var(--field-province)',
  city: 'var(--field-city)',
  district: 'var(--field-district)',
  living_area: 'var(--field-living-area)',
  street_type: 'var(--field-street-type)',
  street_name: 'var(--field-street-name)',
  house: 'var(--field-house)',
  apartment: 'var(--field-apartment)',
  entrance: 'var(--field-entrance)',
  floor: 'var(--field-floor)',
  landmark: 'var(--field-landmark)',
} satisfies Record<AddressField, string>
