# @devn/bot-detector-server

Framework-independent behavioral risk engine for Node.js and any HTTP framework.

**No database required.** Provide your own `SiteResolver`, `SessionStore`, and optional `RateLimiter` / `EventSink`.

## Install

```bash
pnpm add @devn/bot-detector-server
```

## Usage

```ts
import {
  BotDetectionServer,
  MemorySiteResolver,
  MemorySessionStore,
} from '@devn/bot-detector-server'

const detector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    {
      siteKey: 'site_public_xxx',
      site: {
        siteId: '1',
        tenantId: 'tenant_1',
        allowedDomains: ['example.com', 'www.example.com'],
        status: 'active',
      },
    },
  ]),
  sessionStore: new MemorySessionStore(),
})

const session = await detector.createSession({
  siteKey: 'site_public_xxx',
  hostname: 'example.com',
  timestamp: Date.now(),
})

const result = await detector.analyze({
  siteKey: 'site_public_xxx',
  sessionId: session.sessionId,
  sequence: 1,
  timestamp: Date.now(),
  hostname: 'example.com',
  telemetry: { version: 1 },
  request: { ip: '1.2.3.4', userAgent: '...' },
})
```

Wire `createSession` / `analyze` to `POST /v1/session` and `POST /v1/analyze` in Express, Fastify, Hono, etc.
