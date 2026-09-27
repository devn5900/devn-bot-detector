import { describe, expect, it } from 'vitest'
import {
  BotDetectionServer,
  MemoryRateLimiter,
  MemorySessionStore,
  MemorySiteResolver,
  TokenManager,
} from './index'
import { BotDetectorError } from 'devn-bot-detector-core'

const SECRET = 'test-secret-key-32chars-minimum!'

function createServer(overrides: Partial<ConstructorParameters<typeof BotDetectionServer>[0]> = {}) {
  const siteResolver = new MemorySiteResolver([
    {
      siteKey: 'site_ok',
      site: {
        siteId: 'site-1',
        tenantId: 'tenant-1',
        allowedDomains: ['example.com', 'www.example.com'],
        status: 'active',
      },
    },
  ])
  return new BotDetectionServer({
    secret: SECRET,
    siteResolver,
    sessionStore: new MemorySessionStore(),
    rateLimiter: new MemoryRateLimiter(),
    ...overrides,
  })
}

const baseTelemetry = {
  version: 1 as const,
  interaction: {
    pageLoadTime: Date.now() - 5000,
    firstInteractionTime: Date.now() - 4000,
    timeToFirstInteraction: 1000,
    clickCount: 3,
    interactionCount: 5,
    formInteractionCount: 1,
    scrollCount: 2,
    focusCount: 1,
  },
  pointer: {
    eventCount: 40,
    movementDistance: 1200,
    averageInterval: 45,
    minInterval: 10,
    maxInterval: 200,
    directionChanges: 12,
    idlePeriods: 2,
    activeDuration: 3000,
    clickCount: 3,
  },
  browser: {
    userAgent: 'Mozilla/5.0 Test',
    language: 'en-US',
    languagesLength: 2,
    timezone: 'UTC',
    timezoneOffset: 0,
    platform: 'Linux',
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    webdriver: false,
  },
}

describe('BotDetectionServer', () => {
  it('creates session for valid site/hostname', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    expect(session.sessionId.startsWith('ses_')).toBe(true)
    expect(session.nonce.startsWith('nonce_')).toBe(true)
  })

  it('rejects wrong site key', async () => {
    const server = createServer()
    await expect(
      server.createSession({
        siteKey: 'bad',
        hostname: 'example.com',
        timestamp: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SITE_KEY' })
  })

  it('rejects wrong hostname', async () => {
    const server = createServer()
    await expect(
      server.createSession({
        siteKey: 'site_ok',
        hostname: 'evil.com',
        timestamp: Date.now(),
        request: { origin: 'https://evil.com' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_HOSTNAME' })
  })

  it('analyzes and returns risk result with token', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      nonce: session.nonce,
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: baseTelemetry,
      request: { userAgent: 'Mozilla/5.0 Test' },
    })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(['allow', 'monitor', 'challenge', 'block']).toContain(result.decision)
    expect(result.riskToken?.startsWith('rt_')).toBe(true)
    expect(server.verifyRiskToken(result.riskToken!)).not.toBeNull()
  })

  it('prevents sequence replay', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      nonce: 'nonce_1',
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: baseTelemetry,
    })
    await expect(
      server.analyze({
        siteKey: 'site_ok',
        sessionId: session.sessionId,
        sequence: 1,
        nonce: 'nonce_2',
        timestamp: Date.now(),
        hostname: 'example.com',
        telemetry: baseTelemetry,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SEQUENCE' })
  })

  it('prevents nonce replay', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      nonce: 'nonce_same',
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: baseTelemetry,
    })
    await expect(
      server.analyze({
        siteKey: 'site_ok',
        sessionId: session.sessionId,
        sequence: 2,
        nonce: 'nonce_same',
        timestamp: Date.now(),
        hostname: 'example.com',
        telemetry: baseTelemetry,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NONCE' })
  })

  it('rejects expired session', async () => {
    const server = createServer({ sessionDuration: 1 })
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await new Promise((r) => setTimeout(r, 5))
    await expect(
      server.analyze({
        siteKey: 'site_ok',
        sessionId: session.sessionId,
        sequence: 1,
        timestamp: Date.now(),
        hostname: 'example.com',
        telemetry: baseTelemetry,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('rejects malformed telemetry with forbidden fields', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await expect(
      server.analyze({
        siteKey: 'site_ok',
        sessionId: session.sessionId,
        sequence: 1,
        timestamp: Date.now(),
        hostname: 'example.com',
        telemetry: {
          version: 1,
          keyboard: {
            keydownCount: 1,
            keyupCount: 1,
            averageInterval: 1,
            minInterval: 1,
            maxInterval: 1,
            timingVariance: 0,
            pasteCount: 0,
            // @ts-expect-error intentional forbidden field
            password: 'secret',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TELEMETRY' })
  })

  it('rate limits excessive requests', async () => {
    const server = createServer({
      rateLimits: { sitePerMinute: 2, sessionPerMinute: 100, ipPerMinute: 100 },
    })
    await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    await expect(
      server.createSession({
        siteKey: 'site_ok',
        hostname: 'example.com',
        timestamp: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('webdriver alone does not force block', async () => {
    const server = createServer()
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: {
        ...baseTelemetry,
        browser: { ...baseTelemetry.browser, webdriver: true },
      },
    })
    // May be challenge/monitor but scoring is multi-signal; score should not be forced to 0.
    expect(result.score).toBeGreaterThan(0)
  })

  it('supports custom scoring', async () => {
    const server = createServer({
      customScoring: () => ({ risk: 50 }),
    })
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: baseTelemetry,
    })
    expect(result.score).toBeLessThan(80)
  })

  it('applies action-specific thresholds', async () => {
    const server = createServer({
      actionThresholds: {
        sensitive_payment: { allow: 101, monitor: 80, challenge: 50 },
      },
    })
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    // Score ~85 would normally be allow (default allow is >=70), but sensitive_payment requires >=98
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      timestamp: Date.now(),
      hostname: 'example.com',
      action: 'sensitive_payment',
      telemetry: baseTelemetry,
    })
    expect(result.action).toBe('sensitive_payment')
    expect(result.decision).not.toBe('allow')
  })

  it('bypasses risk evaluation for allowlisted IPs', async () => {
    const server = createServer({
      ipAllowlist: ['127.0.0.1', '10.0.0.0/8'],
    })
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
      request: { ip: '10.5.5.5' },
    })
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      timestamp: Date.now(),
      hostname: 'example.com',
      telemetry: baseTelemetry,
      request: { ip: '10.5.5.5' },
    })
    expect(result.score).toBe(100)
    expect(result.decision).toBe('allow')
    expect(result.riskLevel).toBe('low')
  })

  it('blocks denylisted IPs immediately', async () => {
    const server = createServer({
      ipDenylist: ['192.168.1.100', '198.51.100.0/24'],
    })
    await expect(
      server.createSession({
        siteKey: 'site_ok',
        hostname: 'example.com',
        timestamp: Date.now(),
        request: { ip: '198.51.100.42' },
      }),
    ).rejects.toMatchObject({ code: 'IP_BLOCKED' })
  })

  it('consumes one-time risk token and rejects replays', async () => {
    const { MemoryTokenRevocationStore } = await import('./index')
    const tokenStore = new MemoryTokenRevocationStore()
    const server = createServer({ tokenRevocationStore: tokenStore })
    const session = await server.createSession({
      siteKey: 'site_ok',
      hostname: 'example.com',
      timestamp: Date.now(),
    })
    const result = await server.analyze({
      siteKey: 'site_ok',
      sessionId: session.sessionId,
      sequence: 1,
      timestamp: Date.now(),
      hostname: 'example.com',
      action: 'checkout',
      telemetry: baseTelemetry,
    })

    expect(result.riskToken).toBeDefined()
    // First consumption succeeds
    const payload = await server.consumeRiskToken(result.riskToken!, {
      expectedAction: 'checkout',
    })
    expect(payload.action).toBe('checkout')

    // Second consumption is rejected as replay
    await expect(server.consumeRiskToken(result.riskToken!)).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_USED',
    })
  })
})

describe('TokenManager security', () => {
  it('rejects forged and expired tokens', () => {
    const tm = new TokenManager(SECRET)
    const token = tm.createRiskToken({
      requestId: 'req_1',
      siteId: 'site-1',
      sessionId: 'ses_1',
      decision: 'allow',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      action: 'login',
    })
    expect(tm.verifyRiskToken(token)).not.toBeNull()
    expect(tm.verifyRiskToken(token, { expectedAction: 'login' })).not.toBeNull()
    expect(tm.verifyRiskToken(token, { expectedAction: 'checkout' })).toBeNull()
    expect(tm.verifyRiskToken(token + 'x')).toBeNull()
    expect(tm.verifyRiskToken('rt_forged.payload')).toBeNull()

    const expired = tm.createRiskToken({
      requestId: 'req_2',
      siteId: 'site-1',
      sessionId: 'ses_1',
      decision: 'allow',
      issuedAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1000,
    })
    expect(tm.verifyRiskToken(expired)).toBeNull()
  })
})

describe('Redis adapters', () => {
  it('works with Redis-like client', async () => {
    const { RedisSessionStore, RedisRateLimiter, RedisTokenRevocationStore } = await import(
      './index'
    )
    const store = new Map<string, string>()
    const mockRedis = {
      async get(key: string) {
        return store.get(key) ?? null
      },
      async set(key: string, value: string) {
        store.set(key, value)
        return 'OK'
      },
      async del(key: string) {
        store.delete(key)
        return 1
      },
    }

    const sessStore = new RedisSessionStore(mockRedis)
    const sess = {
      sessionId: 'ses_redis',
      siteKey: 'sk',
      siteId: 's1',
      tenantId: 't1',
      nonce: 'n1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10_000,
      hostname: 'example.com',
      sequence: 0,
      usedNonces: [],
    }
    await sessStore.create(sess)
    const fetched = await sessStore.get('ses_redis')
    expect(fetched?.sessionId).toBe('ses_redis')
    await sessStore.invalidate('ses_redis')
    expect(await sessStore.get('ses_redis')).toBeNull()

    const limiter = new RedisRateLimiter(mockRedis)
    const rl1 = await limiter.check('test', 2, 60_000)
    expect(rl1.allowed).toBe(true)
    const rl2 = await limiter.check('test', 2, 60_000)
    expect(rl2.allowed).toBe(true)
    const rl3 = await limiter.check('test', 2, 60_000)
    expect(rl3.allowed).toBe(false)

    const revoker = new RedisTokenRevocationStore(mockRedis)
    expect(await revoker.isRevoked('tok_1')).toBe(false)
    await revoker.revoke('tok_1', 5000)
    expect(await revoker.isRevoked('tok_1')).toBe(true)
  })
})

describe('errors', () => {
  it('serializes without stack traces', () => {
    const err = new BotDetectorError('INTERNAL_ERROR', 'boom', 'req_x')
    const json = err.toJSON()
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(json)).not.toContain('stack')
  })
})

