import { ru } from '../i18n/ru.ts'

export interface ApiConfig {
  basePath: string
  useMocks: boolean
}

export function readApiConfig(env: Record<string, string | undefined>): ApiConfig {
  const basePath = (env.VITE_API_BASE || '/api').replace(/\/+$/, '')
  const mockFlag = env.VITE_USE_MOCKS

  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) {
    throw new Error(ru.api.invalidBase)
  }
  if (mockFlag !== undefined && mockFlag !== 'true' && mockFlag !== 'false') {
    throw new Error(ru.api.invalidMockFlag)
  }

  return { basePath, useMocks: mockFlag === 'true' }
}
