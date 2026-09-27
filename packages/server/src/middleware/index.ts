import {
  BotDetectorError,
  SITE_KEY_HEADER,
  type RiskTokenPayload,
  type VerifyRiskTokenOptions,
} from '@devn/bot-detector-core'
import type { BotDetectionServer } from '../BotDetectionServer'

export interface FrameworkRequestLike {
  headers?: Record<string, string | string[] | undefined>
  header?(name: string): string | undefined
  get?(name: string): string | undefined
  body?: unknown
  ip?: string
}

export interface FrameworkResponseLike {
  status(code: number): this
  json(body: unknown): void
}

export interface TokenGuardOptions extends VerifyRiskTokenOptions {
  /** If true, the token is consumed (one-time use, preventing replay attacks). Defaults to false. */
  readonly consume?: boolean
  /** Header to read the token from. Defaults to 'x-risk-token'. */
  readonly headerName?: string
  /** Fallback property to read the token from request body. Defaults to 'riskToken'. */
  readonly bodyField?: string
}

/**
 * Universal helper to extract and verify or consume a risk token from any incoming HTTP request.
 * Useful for Next.js Server Actions, Nuxt, SvelteKit, Remix, NestJS, Fastify, Express, and Hono.
 */
export async function verifyRequestRiskToken(
  server: BotDetectionServer,
  request: FrameworkRequestLike,
  options?: TokenGuardOptions,
): Promise<RiskTokenPayload> {
  const headerName = (options?.headerName ?? 'x-risk-token').toLowerCase()
  const bodyField = options?.bodyField ?? 'riskToken'

  let token: string | undefined
  if (typeof request.header === 'function') {
    token = request.header(headerName)
  } else if (typeof request.get === 'function') {
    token = request.get(headerName)
  } else if (request.headers) {
    const raw = request.headers[headerName]
    token = Array.isArray(raw) ? raw[0] : raw
  }

  if (!token && request.body && typeof request.body === 'object') {
    const fromBody = (request.body as Record<string, unknown>)[bodyField]
    if (typeof fromBody === 'string') token = fromBody
  }

  if (!token) {
    throw new BotDetectorError(
      'MALFORMED_REQUEST',
      `Missing risk token in header '${headerName}' or body field '${bodyField}'.`,
      'req_guard',
    )
  }

  if (options?.consume) {
    return server.consumeRiskToken(token, options)
  }

  const payload = server.verifyRiskToken(token, options)
  if (!payload) {
    throw new BotDetectorError('MALFORMED_REQUEST', 'Invalid or expired risk token.', 'req_guard')
  }

  return payload
}

/** Express / Connect helper creating ready-to-mount route handlers and guards. */
export function createExpressBotDetector(server: BotDetectionServer) {
  return {
    /** Route handler for POST /v1/session */
    sessionHandler: async (req: any, res: any) => {
      try {
        const siteKey = String(req.header(SITE_KEY_HEADER) || req.headers[SITE_KEY_HEADER.toLowerCase()] || '')
        const result = await server.createSession({
          siteKey,
          hostname: req.body?.hostname,
          userAgent: req.body?.userAgent,
          timestamp: req.body?.timestamp,
          request: {
            ip: req.ip,
            userAgent: req.get?.('user-agent'),
            origin: req.get?.('origin'),
            host: req.get?.('host'),
            forwardedFor: req.get?.('x-forwarded-for'),
          },
        })
        res.json(result)
      } catch (err) {
        if (err instanceof BotDetectorError) {
          res.status(err.code === 'RATE_LIMITED' ? 429 : err.code === 'IP_BLOCKED' ? 403 : 400).json(err.toJSON())
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_err' } })
      }
    },

    /** Route handler for POST /v1/analyze */
    analyzeHandler: async (req: any, res: any) => {
      try {
        const siteKey = String(req.header(SITE_KEY_HEADER) || req.headers[SITE_KEY_HEADER.toLowerCase()] || '')
        const result = await server.analyze({
          siteKey,
          ...req.body,
          request: {
            ip: req.ip,
            userAgent: req.get?.('user-agent'),
            origin: req.get?.('origin'),
            host: req.get?.('host'),
            forwardedFor: req.get?.('x-forwarded-for'),
          },
        })
        res.json(result)
      } catch (err) {
        if (err instanceof BotDetectorError) {
          res.status(err.code === 'RATE_LIMITED' ? 429 : err.code === 'IP_BLOCKED' ? 403 : 400).json(err.toJSON())
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error.', requestId: 'req_err' } })
      }
    },

    /** Middleware protecting sensitive routes with risk token verification */
    requireRiskToken: (options?: TokenGuardOptions) => {
      return async (req: any, res: any, next: any) => {
        try {
          const payload = await verifyRequestRiskToken(server, req, options)
          req.riskTokenPayload = payload
          next()
        } catch (err) {
          if (err instanceof BotDetectorError) {
            res.status(err.code === 'TOKEN_ALREADY_USED' ? 409 : 403).json(err.toJSON())
            return
          }
          res.status(403).json({ error: { code: 'MALFORMED_REQUEST', message: 'Forbidden', requestId: 'req_guard' } })
        }
      }
    },
  }
}
