import { copyFile, mkdir } from 'node:fs/promises'

const source = new URL('../../data/geo/', import.meta.url)
const destination = new URL('../public/geo/', import.meta.url)
const files = [
  'kz-regions.geojson',
  'kz-region-borders.geojson',
  'kz-outline.geojson',
  'kz-regions.json',
  'kz-cities.json',
]

await mkdir(destination, { recursive: true })
await Promise.all(files.map((file) => copyFile(new URL(file, source), new URL(file, destination))))
console.info(`Геоданные скопированы: ${files.length} файлов.`)
const licenses = new URL('../public/licenses/', import.meta.url)
await mkdir(licenses, { recursive: true })
await copyFile(new URL('../node_modules/maplibre-gl/LICENSE.txt', import.meta.url), new URL('maplibre-gl.txt', licenses))
