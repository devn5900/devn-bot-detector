import type { RiskConfig, RiskDecision, RiskLevel } from './types'
import { DEFAULT_RISK_THRESHOLDS } from './constants'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function decisionFromScore(score: number, thresholds: RiskConfig = DEFAULT_RISK_THRESHOLDS): RiskDecision {
  if (score >= thresholds.allow) return 'allow'
  if (score >= thresholds.monitor) return 'monitor'
  if (score >= thresholds.challenge) return 'challenge'
  return 'block'
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return 'low'
  if (score >= 40) return 'medium'
  return 'high'
}

export function mergeRiskThresholds(partial?: Partial<RiskConfig>): RiskConfig {
  return {
    allow: partial?.allow ?? DEFAULT_RISK_THRESHOLDS.allow,
    monitor: partial?.monitor ?? DEFAULT_RISK_THRESHOLDS.monitor,
    challenge: partial?.challenge ?? DEFAULT_RISK_THRESHOLDS.challenge,
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length
  }
  // Fallback for unusual environments
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/** Normalize hostname for allowlist comparison. */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

/** Check whether hostname matches an allowed domain (exact or subdomain). */
export function hostnameAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
  const host = normalizeHostname(hostname)
  if (!host) return false
  for (const raw of allowedDomains) {
    const allowed = normalizeHostname(raw)
    if (!allowed) continue
    if (host === allowed) return true
    if (host.endsWith(`.${allowed}`)) return true
  }
  return false
}

export function extractHostnameFromOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    return normalizeHostname(url.hostname)
  } catch {
    return null
  }
}

/** Check whether an IP matches any entry in a list of exact IPs, wildcards, or IPv4 CIDR blocks. */
export function ipMatches(ip: string | undefined, patterns: readonly string[]): boolean {
  if (!ip || !patterns || patterns.length === 0) return false
  const cleanIp = ip.trim().toLowerCase()

  for (const raw of patterns) {
    const pattern = raw.trim().toLowerCase()
    if (!pattern) continue
    if (pattern === cleanIp || pattern === '*') return true

    // Wildcard match (e.g. 192.168.*)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
      if (regex.test(cleanIp)) return true
      continue
    }

    // CIDR match (IPv4)
    if (pattern.includes('/')) {
      const [range, prefixStr] = pattern.split('/')
      const prefix = parseInt(prefixStr, 10)
      if (isNaN(prefix) || prefix < 0 || prefix > 32) continue

      const ipParts = cleanIp.split('.').map(Number)
      const rangeParts = range.split('.').map(Number)

      if (
        ipParts.length === 4 &&
        rangeParts.length === 4 &&
        ipParts.every((n) => !isNaN(n) && n >= 0 && n <= 255) &&
        rangeParts.every((n) => !isNaN(n) && n >= 0 && n <= 255)
      ) {
        const ipInt =
          ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0
        const rangeInt =
          ((rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3]) >>>
          0
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
        if ((ipInt & mask) === (rangeInt & mask)) return true
      }
    }
  }
  return false
}

