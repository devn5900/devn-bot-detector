# Advanced Options & Configuration Guide

`@devn/bot-detector` provides enterprise-grade flexibility for modern bot prevention and behavioral risk scoring. This guide covers all advanced client and server configuration options.

---

## Table of Contents

1. [Client Advanced Options](#client-advanced-options)
   - [Custom Request Headers & Dynamic Auth](#custom-request-headers--dynamic-auth)
   - [Retries, Backoff & Timeouts](#retries-backoff--timeouts)
   - [Traffic Sampling (sampleRate)](#traffic-sampling-samplerate)
   - [Action-Scoped Checking (checkAction)](#action-scoped-checking-checkaction)
   - [Lifecycle Controls (pause, resume)](#lifecycle-controls-pause-resume)
   - [Client Event Hooks](#client-event-hooks)
2. [Server Advanced Options](#server-advanced-options)
   - [Action-Specific Risk Bands (actionThresholds)](#action-specific-risk-bands-actionthresholds)
   - [IP Allowlist & Denylist (CIDR & Wildcards)](#ip-allowlist--denylist-cidr--wildcards)
   - [Cryptographic One-Time Risk Tokens & Replay Prevention](#cryptographic-one-time-risk-tokens--replay-prevention)
   - [Tuning Detector Rule Weights](#tuning-detector-rule-weights)
   - [Custom Scoring & External ML / Threat Feeds](#custom-scoring--external-ml--threat-feeds)
   - [Reverse Proxy & Cloudflare Header Trust](#reverse-proxy--cloudflare-header-trust)
3. [Production Storage Adapters (Redis)](#production-storage-adapters-redis)
   - [RedisSessionStore](#redissessionstore)
   - [RedisRateLimiter](#redisratelimiter)
   - [RedisTokenRevocationStore](#redistokenrevocationstore)
4. [Multi-Tenant White-Label Setup (SiteResolver)](#multi-tenant-white-label-setup-siteresolver)

---

## Client Advanced Options

### Custom Request Headers & Dynamic Auth

If your backend routes require CSRF tokens, Bearer tokens, or tenant headers, pass them via the `headers` option. `headers` accepts either a static object or an async function evaluated on every HTTP call:

```ts
import { BotDetector } from '@devn/bot-detector-client'

const detector = new BotDetector({
  siteKey: 'site_public_prod',
  endpoint: 'https://api.example.com/bot',
  // Dynamic header provider
  headers: async () => ({
    'X-CSRF-Token': await getCsrfToken(),
    'X-Client-Version': '2.4.0',
  }),
  credentials: 'include', // 'omit' | 'same-origin' | 'include'
})
```

### Retries, Backoff & Timeouts

Configure network resiliency to prevent false positives when mobile clients experience flaky connectivity:

```ts
const detector = new BotDetector({
  siteKey: 'site_public_prod',
  endpoint: '/api/bot',
  timeoutMs: 8000,      // Abort requests exceeding 8 seconds (default: 10,000ms)
  retries: 2,           // Retry up to 2 times on network failures (default: 0)
  retryDelayMs: 400,    // Exponential backoff base: 400ms -> 800ms
  failOpen: true,       // On ultimate failure, return 'monitor' instead of throwing
})
```

### Traffic Sampling (`sampleRate`)

For high-traffic platforms (e.g. e-commerce product pages) where scoring every single session might be unnecessary, use `sampleRate` (0.0 to 1.0):

```ts
const detector = new BotDetector({
  siteKey: 'site_public_prod',
  endpoint: '/api/bot',
  sampleRate: 0.25, // Only evaluate 25% of sessions; others return instant 'allow'
})
```

### Action-Scoped Checking (`checkAction`)

Different actions have different risk profiles. Passing the `action` name tags the telemetry payload and locks the returned HMAC risk token to that specific operation:

```ts
// Checking a specific action before submitting a form
const result = await detector.checkAction('login', { flow: 'passwordless' })

// Or using check() with options
const result = await detector.check({
  action: 'checkout_payment',
  metadata: { cartTotalUsd: 149.99 },
})
```

### Lifecycle Controls (`pause`, `resume`)

Pause telemetry collection when a modal closes, when a user switches away from a sensitive view, or during background SPA route changes:

```ts
// User minimizes an interactive widget
detector.pause()
console.log(detector.isPaused()) // true

// User returns to the view
detector.resume()
```

### Client Event Hooks

Hook into client lifecycle events for metrics, telemetry monitoring, or debugging:

```ts
const detector = new BotDetector({
  siteKey: 'site_public_prod',
  endpoint: '/api/bot',
  onSessionCreated: (session) => {
    console.log(`[BotDetector] Session initialized: ${session.sessionId}`)
  },
  onCheck: (result) => {
    datadogRum.addAction('bot_check', { score: result.score, decision: result.decision })
  },
  onError: (error) => {
    Sentry.captureException(error)
  },
})
```

---

## Server Advanced Options

### Action-Specific Risk Bands (`actionThresholds`)

Not all endpoints should share the same risk tolerance. A public blog search can have relaxed thresholds, whereas a withdrawal or password reset requires strict scoring:

```ts
import { BotDetectionServer } from '@devn/bot-detector-server'

const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  // Global defaults
  riskThresholds: {
    allow: 70,
    monitor: 50,
    challenge: 30,
  },
  // Per-action thresholds:
  actionThresholds: {
    // High-security sensitive actions: require high human confidence
    login: { allow: 80, monitor: 60, challenge: 40 },
    checkout: { allow: 85, monitor: 70, challenge: 50 },
    password_reset: { allow: 90, monitor: 75, challenge: 55 },
    // Low-risk actions
    newsletter_signup: { allow: 60, monitor: 40, challenge: 20 },
  },
})
```

### IP Allowlist & Denylist (CIDR & Wildcards)

Configure zero-overhead IP filtering directly inside the server:

- **Allowlist**: Bypasses the risk engine and returns an instant `allow` (score 100) with a valid risk token. Useful for internal test runners, trusted corporate subnets, and monitoring pingers.
- **Denylist**: Instantly rejects the request and throws an `IP_BLOCKED` error.

```ts
const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  // Supports exact IPs, IPv4 CIDR blocks, and wildcards
  ipAllowlist: [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',          // Internal VPN subnet
    '192.168.1.*',         // Local office subnet
  ],
  ipDenylist: [
    '198.51.100.4',        // Known scraper IP
    '203.0.113.0/24',      // Abusive proxy block
  ],
})
```

### Cryptographic One-Time Risk Tokens & Replay Prevention

To prevent an attacker from completing behavioral telemetry on one endpoint and replaying the same token multiple times (e.g. credential stuffing or card testing), use `consumeRiskToken`:

```ts
// 1. Configure server with a TokenRevocationStore (e.g. Memory or Redis)
import { BotDetectionServer, RedisTokenRevocationStore } from '@devn/bot-detector-server'

const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  tokenRevocationStore: new RedisTokenRevocationStore(redisClient),
})

// 2. In your sensitive endpoint (e.g., POST /api/transfer)
app.post('/api/transfer', async (req, res) => {
  const token = req.headers['x-risk-token']

  // Atomically validates signature, expiration, action match, AND marks token as consumed
  const payload = await server.consumeRiskToken(token, {
    expectedAction: 'transfer', // Ensures token cannot be forged from a 'login' check
    maxAgeMs: 2 * 60 * 1000,    // Enforce maximum token age (e.g., 2 minutes)
  })

  if (payload.decision === 'block') {
    return res.status(403).json({ error: 'Blocked' })
  }

  // Proceed with transfer...
})
```

If an attacker attempts to submit the same `x-risk-token` a second time, `consumeRiskToken` throws:
`BotDetectorError: TOKEN_ALREADY_USED ("Risk token has already been consumed.")`.

### Tuning Detector Rule Weights

All built-in detectors have weighted risk contributions. You can tune any individual rule weight or disable it entirely (by setting weight to `0`):

```ts
const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  detectorWeights: {
    WEBDRIVER: 40,               // Increase penalty for navigator.webdriver
    SOFTWARE_WEBGL: 30,          // SwiftShader / llvmpipe software renderer penalty
    LINEAR_POINTER_PATH: 25,     // Robotic straight cursor trajectory
    KEYBOARD_TOO_FAST: 20,       // Inhuman typing speed (<15ms average key interval)
    ZERO_DESKTOP_PLUGINS: 0,     // Disable zero desktop plugins check
  },
})
```

### Built-in Detectors Reference

| Detector Code | Default Weight | Description |
|---------------|:--------------:|-------------|
| `WEBDRIVER` | +25 | `navigator.webdriver === true` |
| `HEADLESS_UA` | +20 | User-Agent contains `headless` or `phantomjs` |
| `SOFTWARE_WEBGL` | +22 | Software WebGL renderer (SwiftShader, llvmpipe, softpipe, Mesa) |
| `MISSING_CHROME_OBJ` | +18 | User-Agent declares Chrome, but `window.chrome` is missing |
| `ZERO_DESKTOP_PLUGINS` | +12 | Non-mobile browser declaring 0 installed plugins |
| `LINEAR_POINTER_PATH` | +20 | Significant mouse movement with 0 direction changes |
| `SENSITIVE_ACTION_NO_INTERACTION` | +25 | Sensitive action (login, checkout) with 0 prior interactions |
| `SENSITIVE_ACTION_SUB_HUMAN_SPEED` | +20 | Action executed in <150ms from page load |
| `HIGH_SEQUENCE_VELOCITY` | +30 | Unusually high sequence count in very short session duration |
| `KEYBOARD_TOO_UNIFORM` | +18 | Typing timing variance < 1 (robotic uniform interval) |
| `KEYBOARD_TOO_FAST` | +15 | Average keystroke interval < 15ms |
| `NATURAL_TTFI` | -8 | Natural human time to first interaction (200ms – 120s) |
| `NATURAL_POINTER` | -8 | Human cursor movement with multiple natural direction changes |
| `MIXED_INTERACTION` | -6 | Diverse user interactions (keyboard, scroll, pointer) |

### Custom Scoring & External ML / Threat Feeds

Hook your own threat intelligence (e.g. IP quality scores, Datacenter ASN lookups, account risk history, or ML models):

```ts
const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  customScoring: async (input) => {
    let additiveRisk = 0
    const reasons = []

    // Check ASN or IP reputation
    const ipRep = await myThreatIntel.lookup(input.request.ip)
    if (ipRep.isDataCenter) {
      additiveRisk += 30
      reasons.push({ code: 'DATACENTER_IP', weight: 30 })
    }

    if (ipRep.isTorExitNode) {
      additiveRisk += 45
      reasons.push({ code: 'TOR_EXIT_NODE', weight: 45 })
    }

    return {
      risk: additiveRisk,
      internalReasons: reasons,
    }
  },
})
```

### Reverse Proxy & Cloudflare Header Trust

Never trust `X-Forwarded-For` without enabling `trustProxy`. When behind Cloudflare, AWS ALB, NGINX, or GCP Load Balancer:

```ts
const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  trustProxy: true, // Reads the first client IP from X-Forwarded-For
})
```

---

## Production Storage Adapters (Redis)

The SDK provides ready-to-use production storage adapters for Redis (`ioredis`, `@redis/client`, Upstash, or Valkey):

```ts
import Redis from 'ioredis'
import {
  BotDetectionServer,
  RedisSessionStore,
  RedisRateLimiter,
  RedisTokenRevocationStore,
} from '@devn/bot-detector-server'

const redis = new Redis(process.env.REDIS_URL!)

export const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  sessionStore: new RedisSessionStore(redis, {
    prefix: 'app:bot:session:',
    defaultTtlSeconds: 1800, // 30 minutes
  }),
  rateLimiter: new RedisRateLimiter(redis, {
    prefix: 'app:bot:ratelimit:',
  }),
  tokenRevocationStore: new RedisTokenRevocationStore(redis, {
    prefix: 'app:bot:tokens:',
  }),
})
```

---

## Multi-Tenant White-Label Setup (`SiteResolver`)

Rather than hard-coding domains, implement `SiteResolver` to dynamically resolve tenant configuration from your primary database:

```ts
import { BotDetectionServer, type SiteResolver, type SiteInfo } from '@devn/bot-detector-server'
import { db } from './db'

class DatabaseSiteResolver implements SiteResolver {
  async resolveSite(siteKey: string): Promise<SiteInfo | null> {
    const tenant = await db.tenants.findUnique({ where: { apiKey: siteKey } })
    if (!tenant || tenant.status !== 'ACTIVE') return null

    return {
      siteId: tenant.id,
      tenantId: tenant.organizationId,
      allowedDomains: tenant.customDomains, // e.g. ['clientapp.com', 'app.clientapp.com']
      status: 'active',
    }
  }
}

export const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new DatabaseSiteResolver(),
})
```
