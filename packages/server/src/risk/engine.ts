import type {
  RequestContext,
  RiskDecision,
  RiskLevel,
  RiskReason,
  Telemetry,
} from '@devn/bot-detector-core'
import { clamp } from '@devn/bot-detector-core'

export interface RiskInput {
  readonly telemetry: Telemetry
  readonly request: RequestContext
  readonly sessionAgeMs: number
  readonly sequence: number
  readonly action?: string
  readonly metadata?: Record<string, unknown>
}

export interface RiskEvaluation {
  readonly score: number
  readonly confidence: number
  readonly riskLevel: RiskLevel
  readonly decision?: RiskDecision
  readonly internalReasons: RiskReason[]
  /** Optional additive risk from custom scoring (0–100 contribution scale). */
  readonly risk?: number
}

export type Detector = (input: RiskInput) => RiskReason[]

/** Automation indicators — never decisive alone. */
export const AutomationDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const browser = input.telemetry.browser
  if (!browser) return reasons
  if (browser.webdriver) {
    reasons.push({ code: 'WEBDRIVER', weight: 25, detail: 'navigator.webdriver true' })
  }
  const ua = browser.userAgent.toLowerCase()
  if (ua.includes('headless') || ua.includes('phantomjs')) {
    reasons.push({ code: 'HEADLESS_UA', weight: 20 })
  }
  return reasons
}

export const HeadlessAdvancedDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const browser = input.telemetry.browser
  if (!browser) return reasons

  const renderer = (browser.webglRenderer || '').toLowerCase()
  if (
    renderer.includes('swiftshader') ||
    renderer.includes('llvmpipe') ||
    renderer.includes('softpipe') ||
    renderer.includes('mesa offscreen')
  ) {
    reasons.push({
      code: 'SOFTWARE_WEBGL',
      weight: 22,
      detail: 'Software WebGL renderer detected (virtualized/headless)',
    })
  }

  if (browser.userAgent.includes('Chrome') && browser.hasChrome === false) {
    reasons.push({
      code: 'MISSING_CHROME_OBJ',
      weight: 18,
      detail: 'UA reports Chrome but window.chrome is absent',
    })
  }

  const ua = browser.userAgent.toLowerCase()
  const isDesktop =
    !ua.includes('mobile') &&
    !ua.includes('android') &&
    !ua.includes('iphone') &&
    !ua.includes('ipad') &&
    !ua.includes('jsdom')
  if (isDesktop && browser.pluginsCount === 0) {
    reasons.push({ code: 'ZERO_DESKTOP_PLUGINS', weight: 12 })
  }

  return reasons
}

export const EntropyDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const pointer = input.telemetry.pointer
  if (
    pointer &&
    pointer.eventCount >= 25 &&
    pointer.movementDistance > 350 &&
    pointer.directionChanges === 0
  ) {
    reasons.push({
      code: 'LINEAR_POINTER_PATH',
      weight: 20,
      detail: 'Unnatural linear pointer trajectory without direction variance',
    })
  }
  return reasons
}

export const ActionRiskDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  if (!input.action) return reasons

  const action = input.action.toLowerCase()
  const sensitivePatterns = ['login', 'checkout', 'pay', 'transfer', 'signup', 'reset_password']
  const isSensitive = sensitivePatterns.some((p) => action.includes(p))

  if (isSensitive) {
    const interaction = input.telemetry.interaction
    if (interaction && interaction.interactionCount === 0) {
      reasons.push({
        code: 'SENSITIVE_ACTION_NO_INTERACTION',
        weight: 25,
        detail: `Sensitive action "${input.action}" attempted with 0 prior interactions`,
      })
    } else if (
      interaction &&
      interaction.timeToFirstInteraction != null &&
      interaction.timeToFirstInteraction < 150 &&
      interaction.interactionCount > 0
    ) {
      reasons.push({
        code: 'SENSITIVE_ACTION_SUB_HUMAN_SPEED',
        weight: 20,
        detail: `Sensitive action "${input.action}" executed under 150ms`,
      })
    }
  }

  return reasons
}

export const VelocityDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  if (input.sequence > 40 && input.sessionAgeMs < 10_000) {
    reasons.push({ code: 'HIGH_SEQUENCE_VELOCITY', weight: 30 })
  }
  const pointer = input.telemetry.pointer
  if (pointer && pointer.eventCount > 800 && pointer.activeDuration < 2000) {
    reasons.push({ code: 'POINTER_VELOCITY', weight: 20 })
  }
  return reasons
}

export const TimingDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const kb = input.telemetry.keyboard
  if (kb && kb.keydownCount >= 12 && kb.timingVariance != null && kb.timingVariance < 1) {
    reasons.push({ code: 'KEYBOARD_TOO_UNIFORM', weight: 18 })
  }
  if (
    kb &&
    kb.averageInterval != null &&
    kb.averageInterval < 15 &&
    kb.keydownCount >= 10
  ) {
    reasons.push({ code: 'KEYBOARD_TOO_FAST', weight: 15 })
  }
  const interaction = input.telemetry.interaction
  if (
    interaction &&
    interaction.timeToFirstInteraction != null &&
    interaction.timeToFirstInteraction < 20 &&
    interaction.interactionCount > 0
  ) {
    reasons.push({ code: 'IMPOSSIBLE_TTFI', weight: 12 })
  }
  return reasons
}

export const InteractionDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const interaction = input.telemetry.interaction
  if (!interaction) return reasons

  // Zero interaction is mildly suspicious for sensitive ops — not decisive.
  if (interaction.interactionCount === 0) {
    reasons.push({ code: 'ZERO_INTERACTION', weight: 10 })
  }

  // Positive / human-lowering signals encoded as negative weights.
  if (
    interaction.timeToFirstInteraction != null &&
    interaction.timeToFirstInteraction > 200 &&
    interaction.timeToFirstInteraction < 120_000
  ) {
    reasons.push({ code: 'NATURAL_TTFI', weight: -8 })
  }
  if (interaction.interactionCount >= 3) {
    reasons.push({ code: 'MIXED_INTERACTION', weight: -6 })
  }
  return reasons
}

export const BrowserConsistencyDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  const browser = input.telemetry.browser
  if (!browser) return reasons

  if (browser.languagesLength === 0) {
    reasons.push({ code: 'NO_LANGUAGES', weight: 8 })
  }
  if (browser.screenWidth <= 0 || browser.screenHeight <= 0) {
    reasons.push({ code: 'INVALID_SCREEN', weight: 10 })
  }

  // Do NOT penalize mobile, privacy browsers, or missing hardwareConcurrency alone.
  if (input.request.userAgent && browser.userAgent) {
    const reqUa = input.request.userAgent.slice(0, 64)
    const telUa = browser.userAgent.slice(0, 64)
    if (reqUa && telUa && reqUa !== telUa) {
      reasons.push({ code: 'UA_MISMATCH', weight: 15 })
    }
  }
  return reasons
}

export const SessionDetector: Detector = (input) => {
  const reasons: RiskReason[] = []
  if (input.sessionAgeMs < 50 && input.sequence > 1) {
    reasons.push({ code: 'SESSION_TOO_YOUNG', weight: 12 })
  }
  const pointer = input.telemetry.pointer
  if (pointer && pointer.eventCount >= 20 && pointer.directionChanges === 0) {
    reasons.push({ code: 'POINTER_NO_DIRECTION_CHANGE', weight: 10 })
  }
  if (pointer && pointer.movementDistance > 0 && pointer.directionChanges > 5) {
    reasons.push({ code: 'NATURAL_POINTER', weight: -8 })
  }
  const scroll = input.telemetry.scroll
  if (scroll && scroll.scrollCount > 0) {
    reasons.push({ code: 'HAS_SCROLL', weight: -4 })
  }
  const focus = input.telemetry.focus
  if (focus && (focus.focusCount > 0 || focus.blurCount > 0)) {
    reasons.push({ code: 'HAS_FOCUS_CHANGES', weight: -3 })
  }
  return reasons
}

export const DEFAULT_DETECTORS: Detector[] = [
  AutomationDetector,
  HeadlessAdvancedDetector,
  EntropyDetector,
  ActionRiskDetector,
  VelocityDetector,
  TimingDetector,
  InteractionDetector,
  BrowserConsistencyDetector,
  SessionDetector,
]

export interface RiskEngineOptions {
  readonly detectors?: Detector[]
  readonly detectorWeights?: Record<string, number>
}

export class RiskEngine {
  private readonly detectors: Detector[]
  private readonly weights: Record<string, number>

  constructor(options?: Detector[] | RiskEngineOptions) {
    if (Array.isArray(options)) {
      this.detectors = options
      this.weights = {}
    } else {
      this.detectors = options?.detectors ?? DEFAULT_DETECTORS
      this.weights = options?.detectorWeights ?? {}
    }
  }

  evaluate(input: RiskInput): RiskEvaluation {
    const internalReasons: RiskReason[] = []
    for (const detector of this.detectors) {
      for (const reason of detector(input)) {
        const configuredWeight = this.weights[reason.code]
        const weight = configuredWeight !== undefined ? configuredWeight : reason.weight
        if (weight !== 0) {
          internalReasons.push({ ...reason, weight })
        }
      }
    }

    let riskScore = 20 // base uncertainty
    for (const reason of internalReasons) {
      riskScore += reason.weight
    }
    riskScore = clamp(riskScore, 0, 100)
    const score = clamp(100 - riskScore, 0, 100)

    const confidence = clamp(0.4 + Math.abs(score - 50) / 100, 0.4, 0.95)
    const riskLevel: RiskLevel = score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high'

    return {
      score,
      confidence: Number(confidence.toFixed(2)),
      riskLevel,
      internalReasons,
    }
  }
}

