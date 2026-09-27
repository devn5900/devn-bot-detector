import type { RateLimitResult, SessionData, TokenRevocationStore } from 'devn-bot-detector-core'
import type { RateLimiter, RedisLikeClient, SessionStore } from '../interfaces'

export interface RedisSessionStoreOptions {
  readonly prefix?: string
  readonly defaultTtlSeconds?: number
}

/** Production Redis Session Store with automatic TTL expiry. */
export class RedisSessionStore implements SessionStore {
  private readonly client: RedisLikeClient
  private readonly prefix: string
  private readonly defaultTtl: number

  constructor(client: RedisLikeClient, options?: RedisSessionStoreOptions) {
    this.client = client
    this.prefix = options?.prefix ?? 'bd:sess:'
    this.defaultTtl = options?.defaultTtlSeconds ?? 1800
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`
  }

  async create(session: SessionData): Promise<void> {
    const remaining = Math.ceil((session.expiresAt - Date.now()) / 1000)
    const ttl = remaining > 0 ? remaining : this.defaultTtl
    await this.client.set(this.key(session.sessionId), JSON.stringify(session), 'EX', ttl)
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const data = await this.client.get(this.key(sessionId))
    if (!data) return null
    try {
      return JSON.parse(data) as SessionData
    } catch {
      return null
    }
  }

  async update(session: SessionData): Promise<void> {
    const remaining = Math.ceil((session.expiresAt - Date.now()) / 1000)
    const ttl = remaining > 0 ? remaining : this.defaultTtl
    await this.client.set(this.key(session.sessionId), JSON.stringify(session), 'EX', ttl)
  }

  async invalidate(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId))
  }
}

export interface RedisRateLimiterOptions {
  readonly prefix?: string
}

/** Production Redis Rate Limiter with atomic INCR + EXPIRE via Lua or pipeline. */
export class RedisRateLimiter implements RateLimiter {
  private readonly client: RedisLikeClient
  private readonly prefix: string

  constructor(client: RedisLikeClient, options?: RedisRateLimiterOptions) {
    this.client = client
    this.prefix = options?.prefix ?? 'bd:rl:'
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}${key}`
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000))

    try {
      if (typeof this.client.eval === 'function') {
        const lua = `
          local current = redis.call('INCR', KEYS[1])
          if current == 1 then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
          end
          return current
        `
        const count = Number(await this.client.eval(lua, 1, fullKey, windowSec))
        const allowed = count <= limit
        const remaining = Math.max(0, limit - count)
        return {
          allowed,
          remaining,
          ...(allowed ? {} : { retryAfter: windowSec }),
        }
      }

      // Fallback
      const raw = await this.client.get(fullKey)
      const count = (raw ? parseInt(raw, 10) : 0) + 1
      await this.client.set(fullKey, String(count), 'EX', windowSec)
      const allowed = count <= limit
      return {
        allowed,
        remaining: Math.max(0, limit - count),
        ...(allowed ? {} : { retryAfter: windowSec }),
      }
    } catch {
      // Fail-open on cache infrastructure errors
      return { allowed: true, remaining: limit }
    }
  }
}

export interface RedisTokenRevocationStoreOptions {
  readonly prefix?: string
}

/** Production Redis token revocation store for one-time token consumption / replay prevention. */
export class RedisTokenRevocationStore implements TokenRevocationStore {
  private readonly client: RedisLikeClient
  private readonly prefix: string

  constructor(client: RedisLikeClient, options?: RedisTokenRevocationStoreOptions) {
    this.client = client
    this.prefix = options?.prefix ?? 'bd:revoked:'
  }

  async isRevoked(tokenId: string): Promise<boolean> {
    const exists = await this.client.get(`${this.prefix}${tokenId}`)
    return exists !== null
  }

  async revoke(tokenId: string, ttlMs: number): Promise<void> {
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000))
    await this.client.set(`${this.prefix}${tokenId}`, '1', 'EX', ttlSec)
  }
}
