import { ru } from '../i18n/ru'

export type ApiErrorCode = 'networkError' | 'serverError' | 'invalidResponse'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number | undefined

  constructor(code: ApiErrorCode, status?: number) {
    super(ru.api[code])
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
