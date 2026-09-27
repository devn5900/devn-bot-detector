import {
  API_PATHS,
  DEFAULT_SESSION_DURATION_MS,
  DEFAULT_TELEMETRY_INTERVAL_MS,
  MAX_TELEMETRY_BYTES,
  TELEMETRY_VERSION,
  utf8ByteLength,
  type AnalyzeResponse,
  type CheckOptions,
  type ClientConfig,
  type ClientSession,
  type CreateSessionResponse,
  type RiskResult,
  type Telemetry,
} from '@devn/bot-detector-core'
import {
  FocusCollector,
  InteractionCollector,
  KeyboardCollector,
  PointerCollector,
  ScrollCollector,
  TouchCollector,
  VisibilityCollector,
  collectBrowserSignals,
} from './collectors'
import { createLocalSession, isSessionExpired, rotateNonce } from './session'
import { HttpTransport } from './transport'
import { debugLog, isBrowser, nowMs } from './utils'

type ResolvedClientConfig = Required<
  Pick<
    ClientConfig,
    | 'siteKey'
    | 'endpoint'
    | 'autoStart'
    | 'telemetryInterval'
    | 'sessionDuration'
    | 'collectPointer'
    | 'collectKeyboardTiming'
    | 'collectTouch'
    | 'collectScroll'
    | 'collectFocus'
    | 'collectVisibility'
    | 'collectBrowser'
    | 'failOpen'
    | 'maxTelemetryBytes'
    | 'debug'
    | 'sampleRate'
  >
> & {
  readonly headers?: ClientConfig['headers']
  readonly fetchFn?: ClientConfig['fetchFn']
  readonly credentials?: ClientConfig['credentials']
  readonly timeoutMs?: number
  readonly retries?: number
  readonly retryDelayMs?: number
  readonly onSessionCreated?: ClientConfig['onSessionCreated']
  readonly onCheck?: ClientConfig['onCheck']
  readonly onError?: ClientConfig['onError']
}

function resolveConfig(config: ClientConfig): ResolvedClientConfig {
  if (!config.siteKey) throw new Error('BotDetector requires siteKey')
  if (!config.endpoint) throw new Error('BotDetector requires endpoint')
  return {
    siteKey: config.siteKey,
    endpoint: config.endpoint.replace(/\/$/, ''),
    autoStart: config.autoStart ?? true,
    telemetryInterval: config.telemetryInterval ?? DEFAULT_TELEMETRY_INTERVAL_MS,
    sessionDuration: config.sessionDuration ?? DEFAULT_SESSION_DURATION_MS,
    collectPointer: config.collectPointer ?? true,
    collectKeyboardTiming: config.collectKeyboardTiming ?? true,
    collectTouch: config.collectTouch ?? true,
    collectScroll: config.collectScroll ?? true,
    collectFocus: config.collectFocus ?? true,
    collectVisibility: config.collectVisibility ?? true,
    collectBrowser: config.collectBrowser ?? true,
    failOpen: config.failOpen ?? true,
    maxTelemetryBytes: config.maxTelemetryBytes ?? MAX_TELEMETRY_BYTES,
    debug: config.debug ?? false,
    sampleRate: Math.max(0, Math.min(1, config.sampleRate ?? 1)),
    headers: config.headers,
    fetchFn: config.fetchFn,
    credentials: config.credentials,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    retryDelayMs: config.retryDelayMs,
    onSessionCreated: config.onSessionCreated,
    onCheck: config.onCheck,
    onError: config.onError,
  }
}

/**
 * Browser behavioral telemetry SDK.
 * Collects aggregated signals and asks your backend to score risk.
 */
export class BotDetector {
  private readonly config: ResolvedClientConfig
  private readonly transport: HttpTransport
  private readonly pointer = new PointerCollector()
  private readonly keyboard = new KeyboardCollector()
  private readonly touch = new TouchCollector()
  private readonly scroll = new ScrollCollector()
  private readonly focus = new FocusCollector()
  private readonly visibility = new VisibilityCollector()
  private readonly interaction = new InteractionCollector()

  private session: ClientSession | null = null
  private sequence = 0
  private running = false
  private paused = false
  private destroyed = false
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private startPromise: Promise<void> | null = null

  constructor(config: ClientConfig) {
    this.config = resolveConfig(config)
    this.transport = new HttpTransport({
      baseUrl: this.config.endpoint,
      siteKey: this.config.siteKey,
      headers: this.config.headers,
      fetchFn: this.config.fetchFn,
      credentials: this.config.credentials,
      timeoutMs: this.config.timeoutMs,
      retries: this.config.retries,
      retryDelayMs: this.config.retryDelayMs,
    })
    if (this.config.autoStart && isBrowser()) {
      void this.start()
    }
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error('BotDetector has been destroyed')
    if (this.running) return
    if (this.startPromise) return this.startPromise

    this.startPromise = this.doStart()
    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private async doStart(): Promise<void> {
    if (!isBrowser()) {
      debugLog(this.config.debug, 'start() outside browser — collectors skipped')
      return
    }

    this.attachCollectors()
    this.running = true
    await this.ensureSession()
    this.scheduleFlush()
    debugLog(this.config.debug, 'started', { sessionId: this.session?.sessionId })
  }

  /** Temporarily pause active collectors (e.g. background tab or navigation). */
  pause(): void {
    if (!this.running || this.paused || this.destroyed) return
    this.detachCollectors()
    this.paused = true
    debugLog(this.config.debug, 'paused')
  }

  /** Resume collecting signals after pausing. */
  resume(): void {
    if (!this.running || !this.paused || this.destroyed) return
    this.attachCollectors()
    this.paused = false
    debugLog(this.config.debug, 'resumed')
  }

  isPaused(): boolean {
    return this.paused
  }

  isRunning(): boolean {
    return this.running && !this.destroyed
  }

  /**
   * Collect telemetry and analyze risk via the configured endpoint.
   * On network failure with failOpen=true, returns a monitor decision.
   */
  async check(options?: CheckOptions): Promise<RiskResult> {
    if (this.destroyed) throw new Error('BotDetector has been destroyed')
    if (!this.running) await this.start()

    if (this.config.sampleRate < 1 && Math.random() > this.config.sampleRate) {
      debugLog(this.config.debug, 'skipped check due to sampleRate')
      const sampled = this.fallbackResult('allow', 95)
      this.config.onCheck?.(sampled)
      return sampled
    }

    try {
      await this.ensureSession()
      const session = this.session
      if (!session) throw new Error('No session')

      this.sequence += 1
      const telemetry = this.getTelemetry()
      const body: Record<string, unknown> = {
        sessionId: session.sessionId,
        sequence: this.sequence,
        nonce: session.nonce,
        timestamp: nowMs(),
        hostname: isBrowser() ? location.hostname : '',
        telemetry,
      }
      if (options?.action) body.action = options.action
      if (options?.metadata) body.metadata = options.metadata

      debugLog(this.config.debug, 'analyze request', {
        sessionId: session.sessionId,
        sequence: this.sequence,
        action: options?.action,
      })

      const result = await this.transport.post<AnalyzeResponse>(API_PATHS.analyze, body)
      this.session = rotateNonce(session)
      this.config.onCheck?.(result)
      return result
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      this.config.onError?.(errorObj)
      debugLog(this.config.debug, 'check failed', errorObj.message)
      if (this.config.failOpen) {
        const fallback = this.fallbackResult('monitor')
        this.config.onCheck?.(fallback)
        return fallback
      }
      throw err
    }
  }

  /** Shorthand for check({ action, metadata }). */
  async checkAction(action: string, metadata?: Record<string, unknown>): Promise<RiskResult> {
    return this.check({ action, metadata })
  }


  getSession(): ClientSession | null {
    return this.session
  }

  getTelemetry(): Telemetry {
    const telemetry: Telemetry = {
      version: TELEMETRY_VERSION,
      ...(this.config.collectBrowser ? { browser: collectBrowserSignals() } : {}),
      ...(this.config.collectPointer ? { pointer: this.pointer.snapshot() } : {}),
      ...(this.config.collectKeyboardTiming ? { keyboard: this.keyboard.snapshot() } : {}),
      ...(this.config.collectTouch ? { touch: this.touch.snapshot() } : {}),
      ...(this.config.collectScroll ? { scroll: this.scroll.snapshot() } : {}),
      ...(this.config.collectFocus ? { focus: this.focus.snapshot() } : {}),
      ...(this.config.collectVisibility ? { visibility: this.visibility.snapshot() } : {}),
      interaction: this.interaction.snapshot(),
    }

    return this.enforceSize(telemetry)
  }

  reset(): void {
    this.pointer.reset()
    this.keyboard.reset()
    this.touch.reset()
    this.scroll.reset()
    this.focus.reset()
    this.visibility.reset()
    this.interaction.reset()
    this.sequence = 0
  }

  /** Remove listeners, timers, and clear state. */
  destroy(): void {
    this.destroyed = true
    this.running = false
    this.clearFlush()
    this.detachCollectors()
    this.session = null
    this.reset()
    debugLog(this.config.debug, 'destroyed')
  }

  private attachCollectors(): void {
    if (this.config.collectPointer) this.pointer.start()
    if (this.config.collectKeyboardTiming) this.keyboard.start()
    if (this.config.collectTouch) this.touch.start()
    if (this.config.collectScroll) this.scroll.start()
    if (this.config.collectFocus) this.focus.start()
    if (this.config.collectVisibility) this.visibility.start()
    this.interaction.start()
  }

  private detachCollectors(): void {
    this.pointer.stop()
    this.keyboard.stop()
    this.touch.stop()
    this.scroll.stop()
    this.focus.stop()
    this.visibility.stop()
    this.interaction.stop()
  }

  private async ensureSession(): Promise<void> {
    if (this.session && !isSessionExpired(this.session)) return

    try {
      const response = await this.transport.post<CreateSessionResponse>(API_PATHS.session, {
        hostname: isBrowser() ? location.hostname : '',
        userAgent: isBrowser() ? navigator.userAgent.slice(0, 512) : '',
        timestamp: nowMs(),
      })

      this.session = {
        sessionId: response.sessionId,
        nonce: response.nonce,
        createdAt: nowMs(),
        expiresAt: Date.parse(response.expiresAt) || nowMs() + this.config.sessionDuration,
      }
      this.sequence = 0
      debugLog(this.config.debug, 'session created', { sessionId: this.session.sessionId })
      this.config.onSessionCreated?.(this.session)
    } catch (err) {
      debugLog(this.config.debug, 'session API failed, using local session')
      // Local fallback session — analyze will also fail-open if endpoint is down.
      this.session = createLocalSession(this.config.sessionDuration)
      this.sequence = 0
      this.config.onSessionCreated?.(this.session)
      if (!this.config.failOpen) throw err
    }
  }

  private scheduleFlush(): void {
    this.clearFlush()
    if (this.config.telemetryInterval <= 0) return
    this.flushTimer = setInterval(() => {
      // Keep aggregation warm; no network unless check() is called.
      void this.getTelemetry()
    }, this.config.telemetryInterval)
  }

  private clearFlush(): void {
    if (this.flushTimer != null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private enforceSize(telemetry: Telemetry): Telemetry {
    const fits = (value: Telemetry): boolean =>
      utf8ByteLength(JSON.stringify(value)) <= this.config.maxTelemetryBytes

    if (fits(telemetry)) return telemetry

    const candidates: Telemetry[] = [
      {
        version: TELEMETRY_VERSION,
        interaction: telemetry.interaction,
        browser: telemetry.browser,
      },
      {
        version: TELEMETRY_VERSION,
        interaction: telemetry.interaction,
      },
      { version: TELEMETRY_VERSION },
    ]

    for (const candidate of candidates) {
      if (fits(candidate)) return candidate
    }

    return { version: TELEMETRY_VERSION }
  }

  private fallbackResult(decision: RiskResult['decision'], score?: number): RiskResult {
    return {
      requestId: `req_fallback_${nowMs()}`,
      score: score ?? (decision === 'monitor' ? 55 : decision === 'allow' ? 90 : 50),
      confidence: 0.3,
      decision,
      riskLevel: decision === 'allow' ? 'low' : 'medium',
      timestamp: nowMs(),
    }
  }
}
