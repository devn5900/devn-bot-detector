/**
 * Hono adapter sketch — no Hono dependency inside the SDK.
 */
import { Hono } from 'hono'
import {
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from '@devn/bot-detector-server'

const detector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    {
      siteKey: 'site_ok',
      site: {
        siteId: '1',
        tenantId: 't1',
        allowedDomains: ['example.com'],
        status: 'active',
      },
    },
  ]),
  sessionStore: new MemorySessionStore(),
})

const app = new Hono()

app.post('/v1/session', async (c) => {
  try {
    const siteKey = c.req.header(SITE_KEY_HEADER) ?? ''
    const body = await c.req.json<{
      hostname: string
      userAgent?: string
      timestamp: number
    }>()
    const result = await detector.createSession({
      siteKey,
      ...body,
      request: {
        ip: c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent') ?? undefined,
        origin: c.req.header('origin') ?? undefined,
      },
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return c.json(err.toJSON(), 400)
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' } },
      500,
    )
  }
})

app.post('/v1/analyze', async (c) => {
  try {
    const siteKey = c.req.header(SITE_KEY_HEADER) ?? ''
    const body = await c.req.json<Record<string, unknown>>()
    const result = await detector.analyze({
      siteKey,
      ...(body as never),
      request: {
        ip: c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent') ?? undefined,
        origin: c.req.header('origin') ?? undefined,
      },
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return c.json(err.toJSON(), 400)
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' } },
      500,
    )
  }
})

export default app
