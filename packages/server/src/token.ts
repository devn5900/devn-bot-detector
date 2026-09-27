import { createHmac, timingSafeEqual } from 'node:crypto'
import type { RiskDecision, RiskTokenPayload, VerifyRiskTokenOptions } from 'devn-bot-detector-core'

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

export class TokenManager {
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('TokenManager requires a secret of at least 16 characters')
    }
  }

  createRiskToken(payload: RiskTokenPayload): string {
    const body = b64url(JSON.stringify(payload))
    const sig = b64url(createHmac('sha256', this.secret).update(body).digest())
    return `rt_${body}.${sig}`
  }

  verifyRiskToken(token: string, options?: VerifyRiskTokenOptions): RiskTokenPayload | null {
    if (!token.startsWith('rt_')) return null
    const raw = token.slice(3)
    const parts = raw.split('.')
    if (parts.length !== 2) return null
    const [body, sig] = parts
    if (!body || !sig) return null

    const expected = b64url(createHmac('sha256', this.secret).update(body).digest())
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    try {
      const payload = JSON.parse(fromB64url(body).toString('utf8')) as RiskTokenPayload
      if (
        typeof payload.requestId !== 'string' ||
        typeof payload.siteId !== 'string' ||
        typeof payload.sessionId !== 'string' ||
        typeof payload.decision !== 'string' ||
        typeof payload.issuedAt !== 'number' ||
        typeof payload.expiresAt !== 'number'
      ) {
        return null
      }
      const now = Date.now()
      if (now >= payload.expiresAt) return null

      if (options?.expectedAction && payload.action !== options.expectedAction) {
        return null
      }

      if (options?.maxAgeMs != null && now - payload.issuedAt > options.maxAgeMs) {
        return null
      }

      return payload
    } catch {
      return null
    }
  }
}

export type { RiskDecision, RiskTokenPayload, VerifyRiskTokenOptions }

