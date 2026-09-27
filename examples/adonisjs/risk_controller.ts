/**
 * AdonisJS integration sketch.
 *
 * The SDK has no Adonis dependency. Wire routes to BotDetectionServer.
 *
 * start/routes.ts (conceptual):
 *
 *   import router from '@adonisjs/core/services/router'
 *   const RiskController = () => import('#controllers/risk_controller')
 *   router.post('/v1/session', [RiskController, 'session'])
 *   router.post('/v1/analyze', [RiskController, 'analyze'])
 */

import {
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from 'devn-bot-detector-server'

export const detector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  // In production, implement SiteResolver against your own tenant store.
  siteResolver: {
    async resolveSite(siteKey) {
      // return await Site.query().where('public_key', siteKey).first()
      return new MemorySiteResolver([
        {
          siteKey: 'site_ok',
          site: {
            siteId: '1',
            tenantId: 't1',
            allowedDomains: ['example.com'],
            status: 'active',
          },
        },
      ]).resolveSite(siteKey)
    },
  },
  sessionStore: new MemorySessionStore(),
  eventSink: {
    async onAnalysis(result) {
      // await RiskEvent.create(result)  — your DB, not the SDK's
    },
  },
})

/** Example controller methods */
export async function session(ctx: {
  request: { header: (n: string) => string | undefined; body: () => Record<string, unknown>; ip: () => string }
  response: { status: (n: number) => { json: (b: unknown) => unknown }; json: (b: unknown) => unknown }
}) {
  try {
    const siteKey = ctx.request.header(SITE_KEY_HEADER) ?? ''
    const body = ctx.request.body()
    const result = await detector.createSession({
      siteKey,
      hostname: String(body.hostname ?? ''),
      userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
      timestamp: Number(body.timestamp ?? Date.now()),
      request: { ip: ctx.request.ip() },
    })
    return ctx.response.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return ctx.response.status(400).json(err.toJSON())
    return ctx.response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
}

export async function analyze(ctx: {
  request: { header: (n: string) => string | undefined; body: () => Record<string, unknown>; ip: () => string }
  response: { status: (n: number) => { json: (b: unknown) => unknown }; json: (b: unknown) => unknown }
}) {
  try {
    const siteKey = ctx.request.header(SITE_KEY_HEADER) ?? ''
    const body = ctx.request.body()
    const result = await detector.analyze({
      siteKey,
      ...(body as never),
      request: { ip: ctx.request.ip() },
    })
    return ctx.response.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return ctx.response.status(400).json(err.toJSON())
    return ctx.response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
}
