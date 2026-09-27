/**
 * Fastify adapter sketch — no Fastify dependency inside the SDK.
 */
import Fastify from 'fastify'
import {
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from 'devn-bot-detector-server'

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

const app = Fastify()

app.post('/v1/session', async (req, reply) => {
  try {
    const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] ?? '')
    const body = req.body as {
      hostname: string
      userAgent?: string
      timestamp: number
    }
    return await detector.createSession({
      siteKey,
      ...body,
      request: {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      },
    })
  } catch (err) {
    if (err instanceof BotDetectorError) {
      return reply.status(400).send(err.toJSON())
    }
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
})

app.post('/v1/analyze', async (req, reply) => {
  try {
    const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] ?? '')
    const body = req.body as Record<string, unknown>
    return await detector.analyze({
      siteKey,
      ...(body as never),
      request: {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      },
    })
  } catch (err) {
    if (err instanceof BotDetectorError) {
      return reply.status(400).send(err.toJSON())
    }
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
})

export default app
