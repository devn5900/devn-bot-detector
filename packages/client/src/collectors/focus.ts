import type { FocusSignals } from '@devn/bot-detector-core'
import { isBrowser } from '../utils'

export class FocusCollector {
  private listening = false
  private focusCount = 0
  private blurCount = 0

  private readonly onFocus = (): void => {
    this.focusCount += 1
  }

  private readonly onBlur = (): void => {
    this.blurCount += 1
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    window.addEventListener('focus', this.onFocus)
    window.addEventListener('blur', this.onBlur)
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('focus', this.onFocus)
    window.removeEventListener('blur', this.onBlur)
  }

  snapshot(): FocusSignals {
    return {
      focusCount: this.focusCount,
      blurCount: this.blurCount,
    }
  }

  reset(): void {
    this.focusCount = 0
    this.blurCount = 0
  }
}
