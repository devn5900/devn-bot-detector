import type {
  RateLimitResult,
  RiskResult,
  SessionData,
  SiteInfo,
  TokenRevocationStore,
} from '@devn/bot-detector-core'

export type { TokenRevocationStore }

export interface SiteResolver {
  resolveSite(siteKey: string): Promise<SiteInfo | null>
}

export interface SessionStore {
  create(session: SessionData): Promise<void>
  get(sessionId: string): Promise<SessionData | null>
  update(session: SessionData): Promise<void>
  invalidate(sessionId: string): Promise<void>
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>
}

export interface EventSink {
  onAnalysis?(result: RiskResult): Promise<void> | void
  onSessionCreated?(session: SessionData): Promise<void> | void
  onError?(error: { code: string; message: string; requestId: string }): Promise<void> | void
}

/** Minimal duck-typed Redis interface compatible with ioredis, @redis/client, upstash, etc. */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>
  del(key: string): Promise<unknown>
  eval?(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>
}

