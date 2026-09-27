import type { ClientSession } from '@devn/bot-detector-core'
import { DEFAULT_SESSION_DURATION_MS } from '@devn/bot-detector-core'
import { nowMs, secureId } from './utils'

export function createLocalSession(sessionDurationMs = DEFAULT_SESSION_DURATION_MS): ClientSession {
  const createdAt = nowMs()
  return {
    sessionId: secureId('ses'),
    nonce: secureId('nonce', 12),
    createdAt,
    expiresAt: createdAt + sessionDurationMs,
  }
}

export function isSessionExpired(session: ClientSession, now = nowMs()): boolean {
  return now >= session.expiresAt
}

export function rotateNonce(session: ClientSession): ClientSession {
  return {
    ...session,
    nonce: secureId('nonce', 12),
  }
}
