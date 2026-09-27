/**
 * Minimal Node.js HTTP adapter for devn-bot-detector-server
 *
 * POST /v1/session
 * POST /v1/analyze
 *
 * Run after building packages:
 *   node --experimental-strip-types examples/node/server.ts
 * or compile with tsx/ts-node.
 */
import http from 'node:http'
import {
  API_PATHS,
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from 'devn-bot-detector-server'

const detector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET ?? 'dev-secret-change-me-16+',
  siteResolver: new MemorySiteResolver([
    {
      siteKey: 'site_ok',
      site: {
        siteId: '1',
        tenantId: 'tenant_1',
        allowedDomains: ['localhost', '127.0.0.1', 'example.com', 'www.example.com'],
        status: 'active',
      },
    },
  ]),
  sessionStore: new MemorySessionStore(),
  debug: true,
})

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('MALFORMED_JSON'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': `Content-Type, ${SITE_KEY_HEADER}`,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }

  const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] ?? '')
  try {
    if (req.method === 'POST' && req.url === API_PATHS.session) {
      const body = (await readBody(req)) as Record<string, unknown>
      const result = await detector.createSession({
        siteKey,
        hostname: String(body.hostname ?? ''),
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
        timestamp: Number(body.timestamp ?? Date.now()),
        request: {
          ip: req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
          host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
        },
      })
      send(res, 200, result)
      return
    }

    if (req.method === 'POST' && req.url === API_PATHS.analyze) {
      const body = (await readBody(req)) as Record<string, unknown>
      const result = await detector.analyze({
        siteKey,
        sessionId: String(body.sessionId ?? ''),
        sequence: Number(body.sequence ?? 0),
        nonce: typeof body.nonce === 'string' ? body.nonce : undefined,
        timestamp: Number(body.timestamp ?? Date.now()),
        hostname: String(body.hostname ?? ''),
        telemetry: body.telemetry as never,
        request: {
          ip: req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
        },
      })
      send(res, 200, result)
      return
    }

    send(res, 404, { error: { code: 'MALFORMED_REQUEST', message: 'Not found', requestId: 'req_na' } })
  } catch (err) {
    if (err instanceof BotDetectorError) {
      send(res, 400, err.toJSON())
      return
    }
    if (err instanceof Error && err.message === 'MALFORMED_JSON') {
      send(res, 400, {
        error: { code: 'MALFORMED_REQUEST', message: 'Malformed JSON.', requestId: 'req_na' },
      })
      return
    }
    send(res, 500, {
      error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_na' },
    })
  }
})

const port = Number(process.env.PORT ?? 8787)
server.listen(port, () => {
  console.log(`bot-detector node example on http://localhost:${port}`)
})
