import type { ErrorCode } from './constants'
import type { ApiErrorBody } from './types'

export class BotDetectorError extends Error {
  readonly code: ErrorCode
  readonly requestId: string

  constructor(code: ErrorCode, message: string, requestId: string) {
    super(message)
    this.name = 'BotDetectorError'
    this.code = code
    this.requestId = requestId
  }

  toJSON(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
      },
    }
  }
}

export function isBotDetectorError(value: unknown): value is BotDetectorError {
  return value instanceof BotDetectorError
}
