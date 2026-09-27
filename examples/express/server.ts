/**
 * Express adapter sketch — package itself has no Express dependency.
 */
import express from 'express'
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

const app = express()
app.use(express.json({ limit: '64kb' }))

app.post('/v1/session', async (req, res) => {
  try {
    const siteKey = String(req.header(SITE_KEY_HEADER) ?? '')
    const result = await detector.createSession({
      siteKey,
      hostname: req.body.hostname,
      userAgent: req.body.userAgent,
      timestamp: req.body.timestamp,
      request: {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        origin: req.get('origin') ?? undefined,
        host: req.get('host') ?? undefined,
      },
    })
    res.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) {
      res.status(400).json(err.toJSON())
      return
    }
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
})

app.post('/v1/analyze', async (req, res) => {
  try {
    const siteKey = String(req.header(SITE_KEY_HEADER) ?? '')
    const result = await detector.analyze({
      siteKey,
      ...req.body,
      request: {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        origin: req.get('origin') ?? undefined,
      },
    })
    res.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) {
      res.status(400).json(err.toJSON())
      return
    }
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
})

export default app
