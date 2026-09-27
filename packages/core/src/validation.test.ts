import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RISK_THRESHOLDS,
  decisionFromScore,
  hostnameAllowed,
  ipMatches,
  mergeRiskThresholds,
  riskLevelFromScore,
  validateTelemetry,
} from './index'

describe('risk thresholds', () => {
  it('uses default bands', () => {
    expect(decisionFromScore(90)).toBe('allow')
    expect(decisionFromScore(60)).toBe('monitor')
    expect(decisionFromScore(40)).toBe('challenge')
    expect(decisionFromScore(10)).toBe('block')
  })

  it('merges custom thresholds', () => {
    const t = mergeRiskThresholds({ allow: 80 })
    expect(t.allow).toBe(80)
    expect(t.monitor).toBe(DEFAULT_RISK_THRESHOLDS.monitor)
    expect(decisionFromScore(75, t)).toBe('monitor')
  })

  it('maps risk levels', () => {
    expect(riskLevelFromScore(80)).toBe('low')
    expect(riskLevelFromScore(50)).toBe('medium')
    expect(riskLevelFromScore(10)).toBe('high')
  })
})

describe('hostnameAllowed', () => {
  it('matches exact and subdomains', () => {
    expect(hostnameAllowed('example.com', ['example.com'])).toBe(true)
    expect(hostnameAllowed('www.example.com', ['example.com'])).toBe(true)
    expect(hostnameAllowed('evil.com', ['example.com'])).toBe(false)
  })
})

describe('validateTelemetry', () => {
  it('accepts minimal valid telemetry', () => {
    const result = validateTelemetry({
      version: 1,
      pointer: {
        eventCount: 10,
        movementDistance: 100,
        averageInterval: 40,
        minInterval: 10,
        maxInterval: 90,
        directionChanges: 3,
        idlePeriods: 1,
        activeDuration: 1000,
        clickCount: 2,
      },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects forbidden fields', () => {
    const result = validateTelemetry({
      version: 1,
      keyboard: {
        keydownCount: 1,
        keyupCount: 1,
        averageInterval: 10,
        minInterval: 10,
        maxInterval: 10,
        timingVariance: 0,
        pasteCount: 0,
        key: 'a',
      },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects oversized payloads', () => {
    const result = validateTelemetry(
      {
        version: 1,
        browser: {
          userAgent: 'x'.repeat(40_000),
          language: 'en',
          languagesLength: 1,
          timezone: 'UTC',
          timezoneOffset: 0,
          platform: 'x',
          screenWidth: 1,
          screenHeight: 1,
          colorDepth: 24,
          devicePixelRatio: 1,
          hardwareConcurrency: 4,
          maxTouchPoints: 0,
          cookieEnabled: true,
          webdriver: false,
        },
      },
      1024,
    )
    expect(result.ok).toBe(false)
  })

  it('accepts optional advanced browser signals', () => {
    const result = validateTelemetry({
      version: 1,
      browser: {
        userAgent: 'Mozilla/5.0',
        language: 'en',
        languagesLength: 1,
        timezone: 'UTC',
        timezoneOffset: 0,
        platform: 'Linux',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        devicePixelRatio: 1,
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        cookieEnabled: true,
        webdriver: false,
        webglRenderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
        webglVendor: 'Apple Inc.',
        hasChrome: true,
        pluginsCount: 5,
        screenOrientation: 'landscape-primary',
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.browser?.webglRenderer).toBe(
        'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
      )
      expect(result.value.browser?.hasChrome).toBe(true)
      expect(result.value.browser?.pluginsCount).toBe(5)
    }
  })
})

describe('ipMatches', () => {
  it('matches exact IP, wildcard and CIDR ranges', () => {
    expect(ipMatches('192.168.1.50', ['192.168.1.50'])).toBe(true)
    expect(ipMatches('192.168.1.50', ['10.0.0.1'])).toBe(false)
    expect(ipMatches('192.168.1.50', ['192.168.1.0/24'])).toBe(true)
    expect(ipMatches('192.168.2.1', ['192.168.1.0/24'])).toBe(false)
    expect(ipMatches('10.5.2.1', ['10.*'])).toBe(true)
    expect(ipMatches('172.16.0.1', ['*'])).toBe(true)
  })
})

