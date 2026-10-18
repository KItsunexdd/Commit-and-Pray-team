import { build } from 'vite'

// Сборка для сдачи всегда использует серверный разбор, даже при локальных моках.
process.env.VITE_USE_MOCKS = 'false'
await build()
