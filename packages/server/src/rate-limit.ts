import type { RateLimitResult } from '@devn/bot-detector-core'
import type { RateLimiter } from './interfaces'

interface Bucket {
  count: number
  resetAt: number
}

/** Simple in-memory sliding-window rate limiter (dev/default). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now()
    let bucket = this.buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      this.buckets.set(key, bucket)
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      }
    }

    bucket.count += 1
    return {
      allowed: true,
      remaining: Math.max(0, limit - bucket.count),
    }
  }

  /** Best-effort cleanup for long-running processes. */
  prune(): void {
    const now = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key)
    }
  }
}
