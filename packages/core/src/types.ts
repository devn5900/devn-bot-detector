import type { ErrorCode } from './constants'

export type RiskDecision = 'allow' | 'monitor' | 'challenge' | 'block'

export type RiskLevel = 'low' | 'medium' | 'high'

export type SiteStatus = 'active' | 'disabled' | 'suspended'

/** Aggregated browser environment signals (no cookies / storage / tokens). */
export interface BrowserSignals {
  readonly userAgent: string
  readonly language: string
  readonly languagesLength: number
  readonly timezone: string
  readonly timezoneOffset: number
  readonly platform: string
  readonly screenWidth: number
  readonly screenHeight: number
  readonly colorDepth: number
  readonly devicePixelRatio: number
  readonly hardwareConcurrency: number | null
  readonly maxTouchPoints: number
  readonly cookieEnabled: boolean
  /** One risk signal among many — never decisive alone. */
  readonly webdriver: boolean
  readonly webglRenderer?: string | null
  readonly webglVendor?: string | null
  readonly hasChrome?: boolean
  readonly pluginsCount?: number
  readonly screenOrientation?: string | null
}

/** Aggregated pointer/mouse statistics (no raw coordinates retained). */
export interface PointerSignals {
  readonly eventCount: number
  readonly movementDistance: number
  readonly averageInterval: number | null
  readonly minInterval: number | null
  readonly maxInterval: number | null
  readonly directionChanges: number
  readonly idlePeriods: number
  readonly activeDuration: number
  readonly clickCount: number
}

/** Aggregated keyboard timing statistics (no keys / characters / codes). */
export interface KeyboardSignals {
  readonly keydownCount: number
  readonly keyupCount: number
  readonly averageInterval: number | null
  readonly minInterval: number | null
  readonly maxInterval: number | null
  readonly timingVariance: number | null
  readonly pasteCount: number
}

/** Aggregated touch statistics. */
export interface TouchSignals {
  readonly touchCount: number
  readonly averageInterval: number | null
  readonly activeDuration: number
  readonly multiTouchCount: number
}

/** Aggregated scroll statistics. */
export interface ScrollSignals {
  readonly scrollCount: number
  readonly averageInterval: number | null
  readonly totalDistance: number
  readonly directionChanges: number
  readonly activeDuration: number
}

/** Focus / blur statistics. */
export interface FocusSignals {
  readonly focusCount: number
  readonly blurCount: number
}

/** Page visibility statistics. */
export interface VisibilitySignals {
  readonly visibilityChanges: number
  readonly visibleDuration: number
  readonly hiddenDuration: number
}

/** High-level interaction timing (no form values). */
export interface InteractionSignals {
  readonly pageLoadTime: number
  readonly firstInteractionTime: number | null
  readonly timeToFirstInteraction: number | null
  readonly clickCount: number
  readonly interactionCount: number
  readonly formInteractionCount: number
  readonly scrollCount: number
  readonly focusCount: number
}

/** Privacy-safe aggregated telemetry payload. */
export interface Telemetry {
  readonly version: 1
  readonly browser?: BrowserSignals
  readonly pointer?: PointerSignals
  readonly keyboard?: KeyboardSignals
  readonly touch?: TouchSignals
  readonly scroll?: ScrollSignals
  readonly focus?: FocusSignals
  readonly visibility?: VisibilitySignals
  readonly interaction?: InteractionSignals
}

export interface ClientSession {
  readonly sessionId: string
  readonly nonce: string
  readonly createdAt: number
  readonly expiresAt: number
}

export interface SessionData {
  readonly sessionId: string
  readonly siteKey: string
  readonly siteId: string
  readonly tenantId: string
  readonly nonce: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly hostname: string
  /** Last accepted sequence number (replay protection). */
  sequence: number
  /** Nonces already consumed for this session (short-lived). */
  usedNonces: string[]
}

export interface RequestContext {
  readonly ip?: string
  readonly userAgent?: string
  readonly origin?: string
  readonly host?: string
  readonly forwardedFor?: string
}

export interface SiteInfo {
  readonly siteId: string
  readonly tenantId: string
  readonly allowedDomains: readonly string[]
  readonly status: SiteStatus
}

export interface RiskReason {
  readonly code: string
  readonly weight: number
  readonly detail?: string
}

export interface RiskResult {
  readonly requestId: string
  readonly score: number
  readonly confidence: number
  readonly decision: RiskDecision
  readonly riskLevel: RiskLevel
  readonly action?: string
  readonly riskToken?: string
  readonly expiresAt?: string
  readonly timestamp: number
}

export interface RiskConfig {
  readonly allow: number
  readonly monitor: number
  readonly challenge: number
}

export type ClientCredentialsMode = 'omit' | 'same-origin' | 'include'

export interface ClientConfig {
  readonly siteKey: string
  readonly endpoint: string
  readonly autoStart?: boolean
  readonly telemetryInterval?: number
  readonly sessionDuration?: number
  readonly collectPointer?: boolean
  readonly collectKeyboardTiming?: boolean
  readonly collectTouch?: boolean
  readonly collectScroll?: boolean
  readonly collectFocus?: boolean
  readonly collectVisibility?: boolean
  readonly collectBrowser?: boolean
  readonly failOpen?: boolean
  readonly maxTelemetryBytes?: number
  readonly debug?: boolean
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
  readonly fetchFn?: typeof fetch
  readonly credentials?: ClientCredentialsMode
  readonly timeoutMs?: number
  readonly retries?: number
  readonly retryDelayMs?: number
  readonly sampleRate?: number
  readonly onSessionCreated?: (session: ClientSession) => void
  readonly onCheck?: (result: RiskResult) => void
  readonly onError?: (error: Error) => void
}

export interface ServerConfig {
  readonly secret: string
  readonly sessionDuration?: number
  readonly riskThresholds?: Partial<RiskConfig>
  readonly actionThresholds?: Record<string, Partial<RiskConfig>>
  readonly ipAllowlist?: readonly string[]
  readonly ipDenylist?: readonly string[]
  readonly detectorWeights?: Record<string, number>
  readonly enableRiskToken?: boolean
  readonly riskTokenDuration?: number
  readonly trustProxy?: boolean
  readonly debug?: boolean
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode
    readonly message: string
    readonly requestId: string
  }
}

export interface CreateSessionRequest {
  readonly hostname: string
  readonly userAgent?: string
  readonly timestamp: number
}

export interface CreateSessionResponse {
  readonly sessionId: string
  readonly nonce: string
  readonly expiresAt: string
}

export interface AnalyzeRequest {
  readonly sessionId: string
  readonly sequence: number
  readonly nonce?: string
  readonly timestamp: number
  readonly hostname: string
  readonly telemetry: Telemetry
  readonly action?: string
  readonly metadata?: Record<string, unknown>
}

export interface AnalyzeResponse extends RiskResult {}

export interface RateLimitResult {
  readonly allowed: boolean
  readonly remaining: number
  readonly retryAfter?: number
}

export interface RiskTokenPayload {
  readonly requestId: string
  readonly siteId: string
  readonly sessionId: string
  readonly decision: RiskDecision
  readonly issuedAt: number
  readonly expiresAt: number
  readonly action?: string
  readonly score?: number
}

export interface CheckOptions {
  readonly action?: string
  readonly metadata?: Record<string, unknown>
}

export interface VerifyRiskTokenOptions {
  readonly expectedAction?: string
  readonly maxAgeMs?: number
}

export interface TokenRevocationStore {
  isRevoked(tokenId: string): Promise<boolean> | boolean
  revoke(tokenId: string, ttlMs: number): Promise<void> | void
}

