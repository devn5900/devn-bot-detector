import { MAX_TELEMETRY_BYTES, TELEMETRY_VERSION } from './constants'
import type {
  AnalyzeRequest,
  BrowserSignals,
  CreateSessionRequest,
  FocusSignals,
  InteractionSignals,
  KeyboardSignals,
  PointerSignals,
  ScrollSignals,
  Telemetry,
  TouchSignals,
  VisibilitySignals,
} from './types'
import { isPlainObject, utf8ByteLength } from './utils'

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asOptionalFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return asFiniteNumber(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function validateBrowser(raw: unknown): ValidationResult<BrowserSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'browser must be an object' }
  const userAgent = asString(raw.userAgent)
  const language = asString(raw.language)
  const timezone = asString(raw.timezone)
  const platform = asString(raw.platform)
  const languagesLength = asFiniteNumber(raw.languagesLength)
  const timezoneOffset = asFiniteNumber(raw.timezoneOffset)
  const screenWidth = asFiniteNumber(raw.screenWidth)
  const screenHeight = asFiniteNumber(raw.screenHeight)
  const colorDepth = asFiniteNumber(raw.colorDepth)
  const devicePixelRatio = asFiniteNumber(raw.devicePixelRatio)
  const maxTouchPoints = asFiniteNumber(raw.maxTouchPoints)
  const cookieEnabled = asBoolean(raw.cookieEnabled)
  const webdriver = asBoolean(raw.webdriver)
  const hardwareConcurrency =
    raw.hardwareConcurrency === null ? null : asFiniteNumber(raw.hardwareConcurrency)

  const webglRenderer =
    raw.webglRenderer === null
      ? null
      : raw.webglRenderer !== undefined
        ? asString(raw.webglRenderer)
        : undefined
  const webglVendor =
    raw.webglVendor === null
      ? null
      : raw.webglVendor !== undefined
        ? asString(raw.webglVendor)
        : undefined
  const hasChrome =
    raw.hasChrome !== undefined ? asBoolean(raw.hasChrome) ?? undefined : undefined
  const pluginsCount =
    raw.pluginsCount !== undefined ? asFiniteNumber(raw.pluginsCount) ?? undefined : undefined
  const screenOrientation =
    raw.screenOrientation === null
      ? null
      : raw.screenOrientation !== undefined
        ? asString(raw.screenOrientation)
        : undefined

  if (
    userAgent == null ||
    language == null ||
    timezone == null ||
    platform == null ||
    languagesLength == null ||
    timezoneOffset == null ||
    screenWidth == null ||
    screenHeight == null ||
    colorDepth == null ||
    devicePixelRatio == null ||
    maxTouchPoints == null ||
    cookieEnabled == null ||
    webdriver == null ||
    (hardwareConcurrency === undefined)
  ) {
    return { ok: false, message: 'browser signals incomplete' }
  }

  return {
    ok: true,
    value: {
      userAgent: userAgent.slice(0, 512),
      language: language.slice(0, 32),
      languagesLength,
      timezone: timezone.slice(0, 64),
      timezoneOffset,
      platform: platform.slice(0, 64),
      screenWidth,
      screenHeight,
      colorDepth,
      devicePixelRatio,
      hardwareConcurrency,
      maxTouchPoints,
      cookieEnabled,
      webdriver,
      ...(webglRenderer !== undefined
        ? { webglRenderer: webglRenderer ? webglRenderer.slice(0, 128) : null }
        : {}),
      ...(webglVendor !== undefined
        ? { webglVendor: webglVendor ? webglVendor.slice(0, 128) : null }
        : {}),
      ...(hasChrome !== undefined ? { hasChrome } : {}),
      ...(pluginsCount !== undefined ? { pluginsCount } : {}),
      ...(screenOrientation !== undefined
        ? { screenOrientation: screenOrientation ? screenOrientation.slice(0, 32) : null }
        : {}),
    },
  }
}

function validateIntervalStats(raw: Record<string, unknown>, label: string): ValidationResult<{
  averageInterval: number | null
  minInterval: number | null
  maxInterval: number | null
}> {
  const averageInterval = asOptionalFiniteNumber(raw.averageInterval)
  const minInterval = asOptionalFiniteNumber(raw.minInterval)
  const maxInterval = asOptionalFiniteNumber(raw.maxInterval)
  if (averageInterval === undefined || minInterval === undefined || maxInterval === undefined) {
    return { ok: false, message: `${label} intervals incomplete` }
  }
  return { ok: true, value: { averageInterval, minInterval, maxInterval } }
}

function validatePointer(raw: unknown): ValidationResult<PointerSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'pointer must be an object' }
  const eventCount = asFiniteNumber(raw.eventCount)
  const movementDistance = asFiniteNumber(raw.movementDistance)
  const directionChanges = asFiniteNumber(raw.directionChanges)
  const idlePeriods = asFiniteNumber(raw.idlePeriods)
  const activeDuration = asFiniteNumber(raw.activeDuration)
  const clickCount = asFiniteNumber(raw.clickCount)
  const intervals = validateIntervalStats(raw, 'pointer')
  if (!intervals.ok) return intervals
  if (
    eventCount == null ||
    movementDistance == null ||
    directionChanges == null ||
    idlePeriods == null ||
    activeDuration == null ||
    clickCount == null
  ) {
    return { ok: false, message: 'pointer signals incomplete' }
  }
  return {
    ok: true,
    value: {
      eventCount,
      movementDistance,
      ...intervals.value,
      directionChanges,
      idlePeriods,
      activeDuration,
      clickCount,
    },
  }
}

function validateKeyboard(raw: unknown): ValidationResult<KeyboardSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'keyboard must be an object' }
  const keydownCount = asFiniteNumber(raw.keydownCount)
  const keyupCount = asFiniteNumber(raw.keyupCount)
  const pasteCount = asFiniteNumber(raw.pasteCount)
  const timingVariance = asOptionalFiniteNumber(raw.timingVariance)
  const intervals = validateIntervalStats(raw, 'keyboard')
  if (!intervals.ok) return intervals
  if (keydownCount == null || keyupCount == null || pasteCount == null || timingVariance === undefined) {
    return { ok: false, message: 'keyboard signals incomplete' }
  }
  return {
    ok: true,
    value: {
      keydownCount,
      keyupCount,
      ...intervals.value,
      timingVariance,
      pasteCount,
    },
  }
}

function validateTouch(raw: unknown): ValidationResult<TouchSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'touch must be an object' }
  const touchCount = asFiniteNumber(raw.touchCount)
  const averageInterval = asOptionalFiniteNumber(raw.averageInterval)
  const activeDuration = asFiniteNumber(raw.activeDuration)
  const multiTouchCount = asFiniteNumber(raw.multiTouchCount)
  if (
    touchCount == null ||
    averageInterval === undefined ||
    activeDuration == null ||
    multiTouchCount == null
  ) {
    return { ok: false, message: 'touch signals incomplete' }
  }
  return { ok: true, value: { touchCount, averageInterval, activeDuration, multiTouchCount } }
}

function validateScroll(raw: unknown): ValidationResult<ScrollSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'scroll must be an object' }
  const scrollCount = asFiniteNumber(raw.scrollCount)
  const averageInterval = asOptionalFiniteNumber(raw.averageInterval)
  const totalDistance = asFiniteNumber(raw.totalDistance)
  const directionChanges = asFiniteNumber(raw.directionChanges)
  const activeDuration = asFiniteNumber(raw.activeDuration)
  if (
    scrollCount == null ||
    averageInterval === undefined ||
    totalDistance == null ||
    directionChanges == null ||
    activeDuration == null
  ) {
    return { ok: false, message: 'scroll signals incomplete' }
  }
  return {
    ok: true,
    value: { scrollCount, averageInterval, totalDistance, directionChanges, activeDuration },
  }
}

function validateFocus(raw: unknown): ValidationResult<FocusSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'focus must be an object' }
  const focusCount = asFiniteNumber(raw.focusCount)
  const blurCount = asFiniteNumber(raw.blurCount)
  if (focusCount == null || blurCount == null) {
    return { ok: false, message: 'focus signals incomplete' }
  }
  return { ok: true, value: { focusCount, blurCount } }
}

function validateVisibility(raw: unknown): ValidationResult<VisibilitySignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'visibility must be an object' }
  const visibilityChanges = asFiniteNumber(raw.visibilityChanges)
  const visibleDuration = asFiniteNumber(raw.visibleDuration)
  const hiddenDuration = asFiniteNumber(raw.hiddenDuration)
  if (visibilityChanges == null || visibleDuration == null || hiddenDuration == null) {
    return { ok: false, message: 'visibility signals incomplete' }
  }
  return { ok: true, value: { visibilityChanges, visibleDuration, hiddenDuration } }
}

function validateInteraction(raw: unknown): ValidationResult<InteractionSignals> {
  if (!isPlainObject(raw)) return { ok: false, message: 'interaction must be an object' }
  const pageLoadTime = asFiniteNumber(raw.pageLoadTime)
  const firstInteractionTime = asOptionalFiniteNumber(raw.firstInteractionTime)
  const timeToFirstInteraction = asOptionalFiniteNumber(raw.timeToFirstInteraction)
  const clickCount = asFiniteNumber(raw.clickCount)
  const interactionCount = asFiniteNumber(raw.interactionCount)
  const formInteractionCount = asFiniteNumber(raw.formInteractionCount)
  const scrollCount = asFiniteNumber(raw.scrollCount)
  const focusCount = asFiniteNumber(raw.focusCount)
  if (
    pageLoadTime == null ||
    firstInteractionTime === undefined ||
    timeToFirstInteraction === undefined ||
    clickCount == null ||
    interactionCount == null ||
    formInteractionCount == null ||
    scrollCount == null ||
    focusCount == null
  ) {
    return { ok: false, message: 'interaction signals incomplete' }
  }
  return {
    ok: true,
    value: {
      pageLoadTime,
      firstInteractionTime,
      timeToFirstInteraction,
      clickCount,
      interactionCount,
      formInteractionCount,
      scrollCount,
      focusCount,
    },
  }
}

/** Forbidden keys that must never appear in telemetry (defense in depth). */
const FORBIDDEN_TELEMETRY_KEYS = new Set([
  'password',
  'passwords',
  'value',
  'values',
  'key',
  'keys',
  'code',
  'codes',
  'clipboard',
  'cookie',
  'cookies',
  'localStorage',
  'sessionStorage',
  'token',
  'tokens',
  'authorization',
  'text',
  'innerText',
  'innerHTML',
  'coordinates',
  'path',
  'points',
])

function assertNoForbiddenKeys(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const err = assertNoForbiddenKeys(value[i], `${path}[${i}]`)
      if (err) return err
    }
    return null
  }
  if (!isPlainObject(value)) return null
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_TELEMETRY_KEYS.has(key)) {
      return `forbidden telemetry field: ${path}.${key}`
    }
    const err = assertNoForbiddenKeys(value[key], `${path}.${key}`)
    if (err) return err
  }
  return null
}

export function validateTelemetry(
  raw: unknown,
  maxBytes: number = MAX_TELEMETRY_BYTES,
): ValidationResult<Telemetry> {
  if (!isPlainObject(raw)) return { ok: false, message: 'telemetry must be an object' }

  const forbidden = assertNoForbiddenKeys(raw, 'telemetry')
  if (forbidden) return { ok: false, message: forbidden }

  const serialized = JSON.stringify(raw)
  if (utf8ByteLength(serialized) > maxBytes) {
    return { ok: false, message: `telemetry exceeds ${maxBytes} bytes` }
  }

  const version = asFiniteNumber(raw.version)
  if (version !== TELEMETRY_VERSION) {
    return { ok: false, message: 'unsupported telemetry version' }
  }

  const telemetry: {
    version: 1
    browser?: BrowserSignals
    pointer?: PointerSignals
    keyboard?: KeyboardSignals
    touch?: TouchSignals
    scroll?: ScrollSignals
    focus?: FocusSignals
    visibility?: VisibilitySignals
    interaction?: InteractionSignals
  } = { version: 1 }

  if (raw.browser !== undefined) {
    const r = validateBrowser(raw.browser)
    if (!r.ok) return r
    telemetry.browser = r.value
  }
  if (raw.pointer !== undefined) {
    const r = validatePointer(raw.pointer)
    if (!r.ok) return r
    telemetry.pointer = r.value
  }
  if (raw.keyboard !== undefined) {
    const r = validateKeyboard(raw.keyboard)
    if (!r.ok) return r
    telemetry.keyboard = r.value
  }
  if (raw.touch !== undefined) {
    const r = validateTouch(raw.touch)
    if (!r.ok) return r
    telemetry.touch = r.value
  }
  if (raw.scroll !== undefined) {
    const r = validateScroll(raw.scroll)
    if (!r.ok) return r
    telemetry.scroll = r.value
  }
  if (raw.focus !== undefined) {
    const r = validateFocus(raw.focus)
    if (!r.ok) return r
    telemetry.focus = r.value
  }
  if (raw.visibility !== undefined) {
    const r = validateVisibility(raw.visibility)
    if (!r.ok) return r
    telemetry.visibility = r.value
  }
  if (raw.interaction !== undefined) {
    const r = validateInteraction(raw.interaction)
    if (!r.ok) return r
    telemetry.interaction = r.value
  }

  return { ok: true, value: telemetry }
}

export function validateCreateSessionRequest(raw: unknown): ValidationResult<CreateSessionRequest> {
  if (!isPlainObject(raw)) return { ok: false, message: 'body must be an object' }
  const hostname = asString(raw.hostname)
  const timestamp = asFiniteNumber(raw.timestamp)
  const userAgent = raw.userAgent === undefined ? undefined : asString(raw.userAgent) ?? undefined
  if (!hostname || timestamp == null) {
    return { ok: false, message: 'hostname and timestamp are required' }
  }
  return {
    ok: true,
    value: {
      hostname: hostname.slice(0, 253),
      timestamp,
      ...(userAgent !== undefined ? { userAgent: userAgent.slice(0, 512) } : {}),
    },
  }
}

export function validateAnalyzeRequest(
  raw: unknown,
  maxBytes: number = MAX_TELEMETRY_BYTES,
): ValidationResult<AnalyzeRequest> {
  if (!isPlainObject(raw)) return { ok: false, message: 'body must be an object' }
  const sessionId = asString(raw.sessionId)
  const sequence = asFiniteNumber(raw.sequence)
  const timestamp = asFiniteNumber(raw.timestamp)
  const hostname = asString(raw.hostname)
  const nonce = raw.nonce === undefined ? undefined : asString(raw.nonce) ?? undefined
  const action = raw.action === undefined ? undefined : asString(raw.action) ?? undefined
  let metadata: Record<string, unknown> | undefined
  if (raw.metadata !== undefined) {
    if (!isPlainObject(raw.metadata)) {
      return { ok: false, message: 'metadata must be an object' }
    }
    const forbidden = assertNoForbiddenKeys(raw.metadata, 'metadata')
    if (forbidden) return { ok: false, message: forbidden }
    metadata = raw.metadata
  }

  if (!sessionId || sequence == null || timestamp == null || !hostname) {
    return { ok: false, message: 'sessionId, sequence, timestamp, and hostname are required' }
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    return { ok: false, message: 'sequence must be a positive integer' }
  }

  const telemetry = validateTelemetry(raw.telemetry, maxBytes)
  if (!telemetry.ok) return telemetry

  return {
    ok: true,
    value: {
      sessionId,
      sequence,
      timestamp,
      hostname: hostname.slice(0, 253),
      telemetry: telemetry.value,
      ...(nonce !== undefined ? { nonce } : {}),
      ...(action !== undefined ? { action: action.slice(0, 64) } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    },
  }
}
