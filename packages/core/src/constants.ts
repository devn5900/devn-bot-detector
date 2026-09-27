/** Default session lifetime (30 minutes). */
export const DEFAULT_SESSION_DURATION_MS = 30 * 60 * 1000

/** Default client telemetry flush interval. */
export const DEFAULT_TELEMETRY_INTERVAL_MS = 5000

/** Soft max size for a telemetry JSON payload. */
export const MAX_TELEMETRY_BYTES = 32 * 1024

/** Default risk token lifetime (5 minutes). */
export const DEFAULT_RISK_TOKEN_DURATION_MS = 5 * 60 * 1000

/** Protocol version embedded in telemetry. */
export const TELEMETRY_VERSION = 1 as const

/** HTTP header for the public site key. */
export const SITE_KEY_HEADER = 'X-Bot-Site-Key'

/** API path suffixes (relative to endpoint base). */
export const API_PATHS = {
  session: '/v1/session',
  analyze: '/v1/analyze',
} as const

/**
 * Default human-score thresholds (higher = more human-like).
 * allow >= 70, monitor >= 50, challenge >= 30, block < 30
 */
export const DEFAULT_RISK_THRESHOLDS = {
  allow: 70,
  monitor: 50,
  challenge: 30,
} as const

export const ERROR_CODES = [
  'INVALID_SITE_KEY',
  'INVALID_HOSTNAME',
  'INVALID_SESSION',
  'SESSION_EXPIRED',
  'INVALID_NONCE',
  'INVALID_SEQUENCE',
  'RATE_LIMITED',
  'INVALID_TELEMETRY',
  'MALFORMED_REQUEST',
  'INTERNAL_ERROR',
  'IP_BLOCKED',
  'TOKEN_ALREADY_USED',
  'ACTION_MISMATCH',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
