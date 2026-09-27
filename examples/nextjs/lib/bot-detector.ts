import {
  BotDetectionServer,
  MemorySessionStore,
  MemorySiteResolver,
  MemoryTokenRevocationStore,
} from '@devn/bot-detector-server'

// In production, instantiate with RedisSessionStore and RedisRateLimiter
export const serverDetector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET || 'development-secret-minimum-16-chars-long!',
  siteResolver: new MemorySiteResolver([
    {
      siteKey: process.env.NEXT_PUBLIC_BOT_SITE_KEY || 'site_demo_key',
      site: {
        siteId: 'site_nextjs',
        tenantId: 'tenant_default',
        allowedDomains: ['localhost', '127.0.0.1', 'example.com'],
        status: 'active',
      },
    },
  ]),
  sessionStore: new MemorySessionStore(),
  tokenRevocationStore: new MemoryTokenRevocationStore(),
  actionThresholds: {
    login: { allow: 80, monitor: 60, challenge: 40 },
    checkout: { allow: 85, monitor: 70, challenge: 50 },
  },
  trustProxy: true,
})
