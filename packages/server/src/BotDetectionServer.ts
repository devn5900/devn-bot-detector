import {
  BotDetectorError,
  DEFAULT_RISK_TOKEN_DURATION_MS,
  DEFAULT_SESSION_DURATION_MS,
  MAX_TELEMETRY_BYTES,
  decisionFromScore,
  extractHostnameFromOrigin,
  hostnameAllowed,
  ipMatches,
  mergeRiskThresholds,
  normalizeHostname,
  riskLevelFromScore,
  validateAnalyzeRequest,
  validateCreateSessionRequest,
  type AnalyzeRequest,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type RequestContext,
  type RiskConfig,
  type RiskResult,
  type RiskTokenPayload,
  type SessionData,
  type SiteInfo,
  type TokenRevocationStore,
  type VerifyRiskTokenOptions,
} from '@devn/bot-detector-core'
import type { EventSink, RateLimiter, SessionStore, SiteResolver } from './interfaces'
import { MemorySessionStore, MemorySiteResolver, secureId } from './memory'
import { MemoryRateLimiter } from './rate-limit'
import { RiskEngine, type RiskEvaluation, type RiskInput } from './risk'
import { TokenManager } from './token'

export interface ServerOptions {
  readonly secret: string
  readonly sessionDuration?: number
  readonly riskThresholds?: Partial<RiskConfig>
  readonly actionThresholds?: Record<string, Partial<RiskConfig>>
  readonly ipAllowlist?: readonly string[]
  readonly ipDenylist?: readonly string[]
  readonly detectorWeights?: Record<string, number>
  readonly tokenRevocationStore?: TokenRevocationStore
  readonly enableRiskToken?: boolean
  readonly riskTokenDuration?: number
  readonly trustProxy?: boolean
  readonly debug?: boolean
  readonly siteResolver?: SiteResolver
  readonly sessionStore?: SessionStore
  readonly rateLimiter?: RateLimiter
  readonly eventSink?: EventSink
  readonly maxTelemetryBytes?: number
  readonly rateLimits?: {
    readonly sitePerMinute?: number
    readonly sessionPerMinute?: number
    readonly ipPerMinute?: number
  }
  readonly customScoring?: (
    input: RiskInput,
  ) => Partial<RiskEvaluation> | Promise<Partial<RiskEvaluation>>
}

export interface CreateSessionInput extends CreateSessionRequest {
  readonly siteKey: string
  readonly request?: RequestContext
}

export interface AnalyzeInput extends AnalyzeRequest {
  readonly siteKey: string
  readonly request?: RequestContext
}

function debugLog(enabled: boolean, ...args: unknown[]): void {
  if (enabled) console.debug('[bot-detector-server]', ...args)
}

export class BotDetectionServer {
  private readonly sessionDuration: number
  private readonly thresholds: RiskConfig
  private readonly actionThresholds?: Record<string, Partial<RiskConfig>>
  private readonly ipAllowlist: readonly string[]
  private readonly ipDenylist: readonly string[]
  private readonly tokenRevocationStore?: TokenRevocationStore
  private readonly enableRiskToken: boolean
  private readonly riskTokenDuration: number
  private readonly trustProxy: boolean
  private readonly debug: boolean
  private readonly maxTelemetryBytes: number
  private readonly siteResolver: SiteResolver
  private readonly sessionStore: SessionStore
  private readonly rateLimiter: RateLimiter
  private readonly eventSink?: EventSink
  private readonly tokens: TokenManager
  private readonly engine: RiskEngine
  private readonly customScoring?: ServerOptions['customScoring']
  private readonly rateLimits: {
    sitePerMinute: number
    sessionPerMinute: number
    ipPerMinute: number
  }

  constructor(options: ServerOptions) {
    if (!options.secret || options.secret.length < 16) {
      throw new Error('BotDetectionServer requires secret (>= 16 chars)')
    }
    this.sessionDuration = options.sessionDuration ?? DEFAULT_SESSION_DURATION_MS
    this.thresholds = mergeRiskThresholds(options.riskThresholds)
    this.actionThresholds = options.actionThresholds
    this.ipAllowlist = options.ipAllowlist ?? []
    this.ipDenylist = options.ipDenylist ?? []
    this.tokenRevocationStore = options.tokenRevocationStore
    this.enableRiskToken = options.enableRiskToken ?? true
    this.riskTokenDuration = options.riskTokenDuration ?? DEFAULT_RISK_TOKEN_DURATION_MS
    this.trustProxy = options.trustProxy ?? false
    this.debug = options.debug ?? false
    this.maxTelemetryBytes = options.maxTelemetryBytes ?? MAX_TELEMETRY_BYTES
    this.siteResolver = options.siteResolver ?? new MemorySiteResolver()
    this.sessionStore = options.sessionStore ?? new MemorySessionStore()
    this.rateLimiter = options.rateLimiter ?? new MemoryRateLimiter()
    this.eventSink = options.eventSink
    this.tokens = new TokenManager(options.secret)
    this.engine = new RiskEngine({ detectorWeights: options.detectorWeights })
    this.customScoring = options.customScoring
    this.rateLimits = {
      sitePerMinute: options.rateLimits?.sitePerMinute ?? 600,
      sessionPerMinute: options.rateLimits?.sessionPerMinute ?? 60,
      ipPerMinute: options.rateLimits?.ipPerMinute ?? 120,
    }
  }

  async getSite(siteKey: string): Promise<SiteInfo | null> {
    return this.siteResolver.resolveSite(siteKey)
  }

  validateHostname(hostname: string, site: SiteInfo, request?: RequestContext): boolean {
    const host = normalizeHostname(hostname)
    if (!hostnameAllowed(host, site.allowedDomains)) return false

    const originHost = extractHostnameFromOrigin(request?.origin)
    if (originHost && !hostnameAllowed(originHost, site.allowedDomains)) return false

    return true
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResponse> {
    const requestId = secureId('req')
    const parsed = validateCreateSessionRequest(input)
    if (!parsed.ok) {
      throw new BotDetectorError('MALFORMED_REQUEST', parsed.message, requestId)
    }

    const site = await this.resolveActiveSite(input.siteKey, requestId)
    if (!this.validateHostname(parsed.value.hostname, site, input.request)) {
      throw new BotDetectorError(
        'INVALID_HOSTNAME',
        'Hostname is not allowed for this site.',
        requestId,
      )
    }

    const ip = this.resolveIp(input.request)
    if (ip && ipMatches(ip, this.ipDenylist)) {
      throw new BotDetectorError('IP_BLOCKED', 'Access denied from this IP.', requestId)
    }

    await this.assertRateLimits(input.siteKey, undefined, input.request, requestId)

    const now = Date.now()
    const sessionId = secureId('ses')
    const nonce = secureId('nonce', 12)
    const expiresAt = now + this.sessionDuration

    const session: SessionData = {
      sessionId,
      siteKey: input.siteKey,
      siteId: site.siteId,
      tenantId: site.tenantId,
      nonce,
      createdAt: now,
      expiresAt,
      hostname: normalizeHostname(parsed.value.hostname),
      sequence: 0,
      usedNonces: [],
    }

    await this.sessionStore.create(session)
    await this.eventSink?.onSessionCreated?.(session)
    debugLog(this.debug, 'session created', { sessionId, siteId: site.siteId })

    return {
      sessionId,
      nonce,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  async analyze(input: AnalyzeInput): Promise<RiskResult> {
    const requestId = secureId('req')
    const parsed = validateAnalyzeRequest(input, this.maxTelemetryBytes)
    if (!parsed.ok) {
      const code =
        parsed.message.includes('bytes') || parsed.message.includes('forbidden')
          ? 'INVALID_TELEMETRY'
          : 'MALFORMED_REQUEST'
      throw new BotDetectorError(code, parsed.message, requestId)
    }

    const site = await this.resolveActiveSite(input.siteKey, requestId)
    if (!this.validateHostname(parsed.value.hostname, site, input.request)) {
      throw new BotDetectorError(
        'INVALID_HOSTNAME',
        'Hostname is not allowed for this site.',
        requestId,
      )
    }

    const session = await this.sessionStore.get(parsed.value.sessionId)
    if (!session || session.siteKey !== input.siteKey) {
      throw new BotDetectorError('INVALID_SESSION', 'Invalid or unknown session.', requestId)
    }
    if (Date.now() >= session.expiresAt) {
      await this.sessionStore.invalidate(session.sessionId)
      throw new BotDetectorError('SESSION_EXPIRED', 'Invalid or expired session.', requestId)
    }
    if (normalizeHostname(session.hostname) !== normalizeHostname(parsed.value.hostname)) {
      throw new BotDetectorError(
        'INVALID_HOSTNAME',
        'Hostname does not match session.',
        requestId,
      )
    }

    if (parsed.value.sequence <= session.sequence) {
      throw new BotDetectorError(
        'INVALID_SEQUENCE',
        'Sequence replay or out of order.',
        requestId,
      )
    }

    if (parsed.value.nonce && session.usedNonces.includes(parsed.value.nonce)) {
      throw new BotDetectorError('INVALID_NONCE', 'Nonce has already been used.', requestId)
    }

    const ip = this.resolveIp(input.request)
    if (ip && ipMatches(ip, this.ipDenylist)) {
      throw new BotDetectorError('IP_BLOCKED', 'Access denied from this IP.', requestId)
    }

    if (ip && ipMatches(ip, this.ipAllowlist)) {
      debugLog(this.debug, 'allowlisted IP bypassed risk check', { ip })
      const issuedAt = Date.now()
      const tokenExpires = issuedAt + this.riskTokenDuration
      let riskToken: string | undefined
      let expiresAt: string | undefined
      if (this.enableRiskToken) {
        riskToken = this.createRiskToken({
          requestId,
          siteId: site.siteId,
          sessionId: session.sessionId,
          decision: 'allow',
          issuedAt,
          expiresAt: tokenExpires,
          action: parsed.value.action,
          score: 100,
        })
        expiresAt = new Date(tokenExpires).toISOString()
      }
      return {
        requestId,
        score: 100,
        confidence: 0.99,
        decision: 'allow',
        riskLevel: 'low',
        action: parsed.value.action,
        ...(riskToken ? { riskToken } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        timestamp: Date.now(),
      }
    }

    await this.assertRateLimits(input.siteKey, session.sessionId, input.request, requestId)

    const evaluation = await this.calculateRisk({
      telemetry: parsed.value.telemetry,
      request: this.normalizeRequest(input.request),
      sessionAgeMs: Date.now() - session.createdAt,
      sequence: parsed.value.sequence,
      action: parsed.value.action,
      metadata: parsed.value.metadata,
    })

    const effectiveThresholds =
      parsed.value.action && this.actionThresholds?.[parsed.value.action]
        ? mergeRiskThresholds(this.actionThresholds[parsed.value.action])
        : this.thresholds

    const decision = evaluation.decision ?? decisionFromScore(evaluation.score, effectiveThresholds)
    const riskLevel = evaluation.riskLevel ?? riskLevelFromScore(evaluation.score)

    let riskToken: string | undefined
    let expiresAt: string | undefined
    if (this.enableRiskToken) {
      const issuedAt = Date.now()
      const tokenExpires = issuedAt + this.riskTokenDuration
      riskToken = this.createRiskToken({
        requestId,
        siteId: site.siteId,
        sessionId: session.sessionId,
        decision,
        issuedAt,
        expiresAt: tokenExpires,
        action: parsed.value.action,
        score: evaluation.score,
      })
      expiresAt = new Date(tokenExpires).toISOString()
    }

    const usedNonces = [...session.usedNonces]
    if (parsed.value.nonce) {
      usedNonces.push(parsed.value.nonce)
      if (usedNonces.length > 32) usedNonces.splice(0, usedNonces.length - 32)
    }
    await this.sessionStore.update({
      ...session,
      sequence: parsed.value.sequence,
      usedNonces,
      nonce: secureId('nonce', 12),
    })

    const result: RiskResult = {
      requestId,
      score: evaluation.score,
      confidence: evaluation.confidence,
      decision,
      riskLevel,
      action: parsed.value.action,
      ...(riskToken ? { riskToken } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      timestamp: Date.now(),
    }

    await this.eventSink?.onAnalysis?.(result)
    debugLog(this.debug, 'analyzed', {
      requestId,
      decision: result.decision,
      score: result.score,
      action: result.action,
    })
    return result
  }

  async calculateRisk(input: RiskInput): Promise<RiskEvaluation> {
    const base = this.engine.evaluate(input)
    if (!this.customScoring) return base

    const custom = await this.customScoring(input)
    const riskFromCustom = custom.risk ?? 0
    let score = base.score - riskFromCustom
    if (typeof custom.score === 'number') score = custom.score
    score = Math.max(0, Math.min(100, Math.round(score)))

    const internalReasons = [
      ...base.internalReasons,
      ...(custom.internalReasons ?? []),
      ...(riskFromCustom ? [{ code: 'CUSTOM_SCORING', weight: riskFromCustom }] : []),
    ]

    return {
      score,
      confidence: custom.confidence ?? base.confidence,
      riskLevel: custom.riskLevel ?? riskLevelFromScore(score),
      decision: custom.decision,
      internalReasons,
    }
  }

  createRiskToken(payload: RiskTokenPayload): string {
    return this.tokens.createRiskToken(payload)
  }

  verifyRiskToken(token: string, options?: VerifyRiskTokenOptions): RiskTokenPayload | null {
    return this.tokens.verifyRiskToken(token, options)
  }

  /**
   * Validates risk token and consumes it (one-time use) if tokenRevocationStore is configured.
   * Throws TOKEN_ALREADY_USED if already consumed or MALFORMED_REQUEST if invalid/expired.
   */
  async consumeRiskToken(
    token: string,
    options?: VerifyRiskTokenOptions,
  ): Promise<RiskTokenPayload> {
    const requestId = secureId('req')
    const payload = this.verifyRiskToken(token, options)
    if (!payload) {
      throw new BotDetectorError('MALFORMED_REQUEST', 'Invalid or expired risk token.', requestId)
    }

    if (this.tokenRevocationStore) {
      const revoked = await this.tokenRevocationStore.isRevoked(token)
      if (revoked) {
        throw new BotDetectorError(
          'TOKEN_ALREADY_USED',
          'Risk token has already been consumed.',
          requestId,
        )
      }
      const remainingTtl = Math.max(1000, payload.expiresAt - Date.now())
      await this.tokenRevocationStore.revoke(token, remainingTtl)
    }

    return payload
  }

  private async resolveActiveSite(siteKey: string, requestId: string): Promise<SiteInfo> {
    const site = await this.siteResolver.resolveSite(siteKey)
    if (!site || site.status !== 'active') {
      throw new BotDetectorError('INVALID_SITE_KEY', 'Invalid or inactive site key.', requestId)
    }
    return site
  }

  private async assertRateLimits(
    siteKey: string,
    sessionId: string | undefined,
    request: RequestContext | undefined,
    requestId: string,
  ): Promise<void> {
    const site = await this.rateLimiter.check(
      `site:${siteKey}`,
      this.rateLimits.sitePerMinute,
      60_000,
    )
    if (!site.allowed) {
      throw new BotDetectorError('RATE_LIMITED', 'Rate limit exceeded.', requestId)
    }
    if (sessionId) {
      const sess = await this.rateLimiter.check(
        `session:${sessionId}`,
        this.rateLimits.sessionPerMinute,
        60_000,
      )
      if (!sess.allowed) {
        throw new BotDetectorError('RATE_LIMITED', 'Rate limit exceeded.', requestId)
      }
    }
    const ip = this.resolveIp(request)
    if (ip) {
      const ipLimit = await this.rateLimiter.check(`ip:${ip}`, this.rateLimits.ipPerMinute, 60_000)
      if (!ipLimit.allowed) {
        throw new BotDetectorError('RATE_LIMITED', 'Rate limit exceeded.', requestId)
      }
    }
  }

  private resolveIp(request: RequestContext | undefined): string | undefined {
    if (!request) return undefined
    if (this.trustProxy && request.forwardedFor) {
      return request.forwardedFor.split(',')[0]?.trim()
    }
    return request.ip
  }

  private normalizeRequest(request: RequestContext | undefined): RequestContext {
    if (!request) return {}
    return {
      ...(request.ip ? { ip: request.ip } : {}),
      ...(request.userAgent ? { userAgent: request.userAgent } : {}),
      ...(request.origin ? { origin: request.origin } : {}),
      ...(request.host ? { host: request.host } : {}),
      ...(this.trustProxy && request.forwardedFor
        ? { forwardedFor: request.forwardedFor }
        : {}),
    }
  }
}

