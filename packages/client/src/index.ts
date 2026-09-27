export { BotDetector } from './BotDetector'
export { HttpTransport } from './transport'
export { createLocalSession, isSessionExpired } from './session'
export {
  PointerCollector,
  KeyboardCollector,
  TouchCollector,
  ScrollCollector,
  FocusCollector,
  VisibilityCollector,
  InteractionCollector,
  collectBrowserSignals,
} from './collectors'

export type {
  ClientConfig,
  RiskResult,
  Telemetry,
  ClientSession,
  CheckOptions,
} from '@devn/bot-detector-core'
