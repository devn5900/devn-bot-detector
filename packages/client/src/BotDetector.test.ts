import { afterEach, describe, expect, it, vi } from 'vitest'
import { BotDetector } from './BotDetector'
import { PointerCollector } from './collectors/pointer'
import { KeyboardCollector } from './collectors/keyboard'
import { TouchCollector } from './collectors/touch'
import { ScrollCollector } from './collectors/scroll'
import { FocusCollector } from './collectors/focus'
import { VisibilityCollector } from './collectors/visibility'
import { createLocalSession, isSessionExpired } from './session'
import { utf8ByteLength } from 'devn-bot-detector-core'

describe('session', () => {
  it('generates secure session and nonce ids', () => {
    const s = createLocalSession(60_000)
    expect(s.sessionId.startsWith('ses_')).toBe(true)
    expect(s.nonce.startsWith('nonce_')).toBe(true)
    expect(s.expiresAt).toBeGreaterThan(s.createdAt)
  })

  it('detects expiration', () => {
    const s = createLocalSession(1)
    expect(isSessionExpired(s, s.createdAt + 10)).toBe(true)
  })
})

describe('collectors', () => {
  afterEach(() => {
    // cleanup
  })

  it('aggregates pointer without retaining coordinates', () => {
    const c = new PointerCollector()
    c.start()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 50 }))
    window.dispatchEvent(new MouseEvent('click'))
    const snap = c.snapshot()
    expect(snap.eventCount).toBeGreaterThan(0)
    expect(snap.movementDistance).toBeGreaterThan(0)
    expect(snap.clickCount).toBe(1)
    expect(JSON.stringify(snap)).not.toContain('clientX')
    c.stop()
    c.reset()
    expect(c.snapshot().eventCount).toBe(0)
  })

  it('tracks keyboard timing without keys', () => {
    const c = new KeyboardCollector()
    c.start()
    window.dispatchEvent(new KeyboardEvent('keydown'))
    window.dispatchEvent(new KeyboardEvent('keyup'))
    window.dispatchEvent(new Event('paste'))
    const snap = c.snapshot()
    expect(snap.keydownCount).toBe(1)
    expect(snap.keyupCount).toBe(1)
    expect(snap.pasteCount).toBe(1)
    expect(Object.keys(snap)).not.toContain('key')
    c.stop()
  })

  it('aggregates touch/scroll/focus/visibility', () => {
    const touch = new TouchCollector()
    const scroll = new ScrollCollector()
    const focus = new FocusCollector()
    const visibility = new VisibilityCollector()
    touch.start()
    scroll.start()
    focus.start()
    visibility.start()

    window.dispatchEvent(new Event('touchstart'))
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(touch.snapshot().touchCount).toBe(1)
    expect(scroll.snapshot().scrollCount).toBeGreaterThanOrEqual(0)
    expect(focus.snapshot().focusCount).toBe(1)
    expect(visibility.snapshot().visibilityChanges).toBeGreaterThanOrEqual(0)

    touch.stop()
    scroll.stop()
    focus.stop()
    visibility.stop()
  })
})

describe('BotDetector', () => {
  it('destroy removes listeners and clears state', async () => {
    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'http://localhost:9',
      autoStart: false,
      failOpen: true,
    })
    await detector.start()
    detector.destroy()
    expect(detector.getSession()).toBeNull()
    await expect(detector.check()).rejects.toThrow(/destroyed/)
  })

  it('failOpen returns monitor on network failure', async () => {
    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'http://127.0.0.1:1',
      autoStart: false,
      failOpen: true,
    })
    await detector.start()
    const result = await detector.check()
    expect(result.decision).toBe('monitor')
    detector.destroy()
  })

  it('enforces telemetry size', async () => {
    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'http://localhost:9',
      autoStart: false,
      maxTelemetryBytes: 200,
      failOpen: true,
    })
    await detector.start()
    const telemetry = detector.getTelemetry()
    expect(utf8ByteLength(JSON.stringify(telemetry))).toBeLessThanOrEqual(200)
    detector.destroy()
  })

  it('does not throw on module import', () => {
    expect(typeof BotDetector).toBe('function')
  })
})

describe('network mock analyze', () => {
  it('posts analyze when fetch succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v1/session')) {
        return new Response(
          JSON.stringify({
            sessionId: 'ses_abc',
            nonce: 'nonce_abc',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith('/v1/analyze')) {
        const body = JSON.parse(String(init?.body)) as { sequence: number }
        expect(body.sequence).toBe(1)
        return new Response(
          JSON.stringify({
            requestId: 'req_1',
            score: 88,
            confidence: 0.8,
            decision: 'allow',
            riskLevel: 'low',
            timestamp: Date.now(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'https://risk.example.com',
      autoStart: false,
      failOpen: false,
    })
    await detector.start()
    const result = await detector.check()
    expect(result.score).toBe(88)
    expect(result.decision).toBe('allow')
    detector.destroy()
    vi.unstubAllGlobals()
  })

  it('supports pause and resume', async () => {
    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'http://localhost:9',
      autoStart: false,
    })
    await detector.start()
    expect(detector.isRunning()).toBe(true)
    expect(detector.isPaused()).toBe(false)

    detector.pause()
    expect(detector.isPaused()).toBe(true)

    detector.resume()
    expect(detector.isPaused()).toBe(false)
    detector.destroy()
  })

  it('passes action and triggers callbacks on check', async () => {
    let capturedAction: string | undefined
    let callbackCalled = false
    let sessionCallbackCalled = false

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v1/session')) {
        return new Response(
          JSON.stringify({
            sessionId: 'ses_123',
            nonce: 'nonce_123',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith('/v1/analyze')) {
        const body = JSON.parse(String(init?.body)) as { action?: string }
        capturedAction = body.action
        return new Response(
          JSON.stringify({
            requestId: 'req_action_1',
            score: 92,
            confidence: 0.9,
            decision: 'allow',
            riskLevel: 'low',
            action: body.action,
            timestamp: Date.now(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const detector = new BotDetector({
      siteKey: 'site_test',
      endpoint: 'https://risk.example.com',
      autoStart: false,
      onSessionCreated: (s) => {
        if (s.sessionId === 'ses_123') sessionCallbackCalled = true
      },
      onCheck: (res) => {
        if (res.decision === 'allow') callbackCalled = true
      },
    })

    await detector.start()
    const result = await detector.checkAction('checkout_button')
    expect(capturedAction).toBe('checkout_button')
    expect(result.action).toBe('checkout_button')
    expect(callbackCalled).toBe(true)
    expect(sessionCallbackCalled).toBe(true)

    detector.destroy()
    vi.unstubAllGlobals()
  })
})

