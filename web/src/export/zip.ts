const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ZIP STORE: локальные заголовки, центральный каталог и его завершающая запись.
export function zipStore(files: ReadonlyArray<{ name: string; text: string }>): Uint8Array<ArrayBuffer> {
  const entries = files.map(file => ({ name: encoder.encode(file.name), body: encoder.encode(file.text), offset: 0 }))
  const dataSize = entries.reduce((total, file) => total + 30 + file.name.length + file.body.length, 0)
  const directorySize = entries.reduce((total, file) => total + 46 + file.name.length, 0)
  const bytes = new Uint8Array(dataSize + directorySize + 22), view = new DataView(bytes.buffer)
  let cursor = 0
  const u16 = (value: number) => { view.setUint16(cursor, value, true); cursor += 2 }
  const u32 = (value: number) => { view.setUint32(cursor, value, true); cursor += 4 }
  const copy = (value: Uint8Array) => { bytes.set(value, cursor); cursor += value.length }
  const metadata = (file: typeof entries[number]) => {
    u16(20); u16(0x800); u16(0); u16(0); u16(0x21)
    u32(crc32(file.body)); u32(file.body.length); u32(file.body.length); u16(file.name.length)
  }
  for (const file of entries) {
    file.offset = cursor
    u32(0x04034b50); metadata(file); u16(0); copy(file.name); copy(file.body)
  }
  for (const file of entries) {
    u32(0x02014b50); u16(20); metadata(file)
    u16(0); u16(0); u16(0); u16(0); u32(0); u32(file.offset); copy(file.name)
  }
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length)
  u32(directorySize); u32(dataSize); u16(0)
  return bytes
}
