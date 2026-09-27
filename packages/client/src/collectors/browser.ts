import type { BrowserSignals } from 'devn-bot-detector-core'
import { isBrowser } from '../utils'

function getWebglInfo(): { renderer: string | null; vendor: string | null } {
  try {
    if (typeof document === 'undefined') return { renderer: null, vendor: null }
    if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) {
      return { renderer: null, vendor: null }
    }
    const canvas = document.createElement('canvas')
    if (typeof canvas.getContext !== 'function') return { renderer: null, vendor: null }
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return { renderer: null, vendor: null }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return { renderer: null, vendor: null }
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
    return {
      renderer: typeof renderer === 'string' ? renderer.slice(0, 128) : null,
      vendor: typeof vendor === 'string' ? vendor.slice(0, 128) : null,
    }
  } catch {
    return { renderer: null, vendor: null }
  }
}

export function collectBrowserSignals(): BrowserSignals {
  if (!isBrowser()) {
    return {
      userAgent: '',
      language: '',
      languagesLength: 0,
      timezone: 'UTC',
      timezoneOffset: 0,
      platform: '',
      screenWidth: 0,
      screenHeight: 0,
      colorDepth: 0,
      devicePixelRatio: 1,
      hardwareConcurrency: null,
      maxTouchPoints: 0,
      cookieEnabled: false,
      webdriver: false,
    }
  }

  const nav = navigator as Navigator & { webdriver?: boolean; hardwareConcurrency?: number }
  let timezone = 'UTC'
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    // ignore
  }

  const webgl = getWebglInfo()
  const hasChrome = Boolean((window as unknown as { chrome?: unknown }).chrome)
  const pluginsCount = typeof nav.plugins !== 'undefined' ? nav.plugins.length : 0
  const screenOrientation =
    typeof screen !== 'undefined' && screen.orientation && screen.orientation.type
      ? screen.orientation.type
      : null

  return {
    userAgent: (nav.userAgent || '').slice(0, 512),
    language: (nav.language || '').slice(0, 32),
    languagesLength: Array.isArray(nav.languages) ? nav.languages.length : 0,
    timezone: timezone.slice(0, 64),
    timezoneOffset: new Date().getTimezoneOffset(),
    platform: (nav.platform || '').slice(0, 64),
    screenWidth: typeof screen !== 'undefined' ? screen.width || 0 : 0,
    screenHeight: typeof screen !== 'undefined' ? screen.height || 0 : 0,
    colorDepth: typeof screen !== 'undefined' ? screen.colorDepth || 0 : 0,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    maxTouchPoints: nav.maxTouchPoints || 0,
    cookieEnabled: Boolean(nav.cookieEnabled),
    webdriver: Boolean(nav.webdriver),
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    hasChrome,
    pluginsCount,
    screenOrientation,
  }
}

