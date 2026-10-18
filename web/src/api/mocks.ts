import { ru } from '../i18n/ru'
import { addressFields } from './types'
import type { AddressField, AddressResult, AddressSpan, AddressValues, ParseRequest, ParseResponse } from './types'

interface Fixture {
  rawAddress: string
  values: Partial<AddressValues>
  confidence: number
  fragments: Partial<Record<AddressField, string>>
  dictionary?: AddressField[]
}

const almaty = {
  values: {
    province: 'Алматы', city: 'Алматы', district: 'Ауэзовский',
    street_type: 'микрорайон', street_name: 'Аксай 3а', house: '59', apartment: '70',
  },
  confidence: 0.91,
  fragments: { city: 'Алматы', street_type: 'Мкр', street_name: 'Аксай 3а', house: '59', apartment: '70' },
  dictionary: ['province', 'district'],
} satisfies Omit<Fixture, 'rawAddress'>

const fixtures: Fixture[] = [
  { rawAddress: ru.examples[0], ...almaty },
  { rawAddress: 'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70', ...almaty },
  {
    rawAddress: 'Турксибский район, Рыбинский переулок, дом 4',
    values: { province: 'Алматы', city: 'Алматы', district: 'Турксибский', street_type: 'переулок', street_name: 'Рыбинский', house: '4' },
    confidence: 0.8,
    fragments: { district: 'Турксибский', street_type: 'переулок', street_name: 'Рыбинский', house: '4' },
    dictionary: ['province', 'city'],
  },
  {
    rawAddress: ru.examples[1],
    values: { street_name: 'Туран', house: '55/6', entrance: '4', floor: '9', landmark: 'магазин береке' },
    confidence: 0.55,
    fragments: { street_name: 'Туран', house: '55/6', entrance: '4', floor: '9', landmark: 'магазин береке' },
  },
  {
    rawAddress: ru.examples[2],
    values: { street_type: 'квартал', street_name: '66', house: '12', apartment: '69' },
    confidence: 0.55,
    fragments: { street_type: 'квартал', street_name: '66', house: '12', apartment: '69' },
  },
  {
    rawAddress: ru.examples[3],
    values: { province: 'Актюбинская область', city: 'Актобе', street_name: 'Назарбаева', house: '8' },
    confidence: 0.88,
    fragments: { city: 'Актобе', street_name: 'Назарбаева', house: '8' },
    dictionary: ['province'],
  },
  {
    rawAddress: ru.examples[4],
    values: { street_type: 'микрорайон', street_name: 'Нурсити 2', house: '11', entrance: '5', apartment: '239' },
    confidence: 0.55,
    fragments: { street_type: 'микрорайон', street_name: 'Нурсити 2', house: '11', entrance: '5', apartment: '239' },
  },
]

export function mockParse({ records }: ParseRequest): ParseResponse {
  return {
    items: records.map((record) => {
      const raw = record.raw_address.toLocaleLowerCase('ru')
      const fixture = fixtures.find((item) => item.rawAddress.toLocaleLowerCase('ru') === raw.trim())
      const result: AddressResult = {
        id: record.id, raw_address: record.raw_address,
        province: null, city: null, district: null, living_area: null,
        street_type: null, street_name: null, house: null, apartment: null,
        entrance: null, floor: null, landmark: null, confidence: 0,
      }
      if (!fixture) return { result, explain: null }

      Object.assign(result, fixture.values, { confidence: fixture.confidence })
      const sources: NonNullable<ParseResponse['items'][number]['explain']>['sources'] = {}
      const spans: AddressSpan[] = []
      for (const field of addressFields) {
        if (fixture.dictionary?.includes(field)) sources[field] = 'dictionary'
        const fragment = fixture.fragments[field]
        if (!fragment) continue
        const start = raw.indexOf(fragment.toLocaleLowerCase('ru'))
        if (start >= 0) {
          sources[field] = 'string'
          spans.push({ field, start, end: start + fragment.length })
        }
      }
      return { result, explain: { spans: spans.sort((a, b) => a.start - b.start), sources } }
    }),
  }
}
