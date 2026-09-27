import type { KeyboardSignals } from 'devn-bot-detector-core'
import { IntervalTracker, isBrowser, perfNow } from '../utils'

/**
 * Keyboard timing only — never reads event.key / event.code / input values.
 */
export class KeyboardCollector {
  private listening = false
  private keydownCount = 0
  private keyupCount = 0
  private pasteCount = 0
  private readonly intervals = new IntervalTracker()

  private readonly onKeyDown = (): void => {
    this.keydownCount += 1
    this.intervals.mark(perfNow())
  }

  private readonly onKeyUp = (): void => {
    this.keyupCount += 1
  }

  private readonly onPaste = (): void => {
    // Record that paste happened — never clipboard contents.
    this.pasteCount += 1
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    window.addEventListener('keydown', this.onKeyDown, { passive: true })
    window.addEventListener('keyup', this.onKeyUp, { passive: true })
    window.addEventListener('paste', this.onPaste, { passive: true })
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('paste', this.onPaste)
  }

  snapshot(): KeyboardSignals {
    return {
      keydownCount: this.keydownCount,
      keyupCount: this.keyupCount,
      averageInterval: this.intervals.average(),
      minInterval: this.intervals.minInterval(),
      maxInterval: this.intervals.maxInterval(),
      timingVariance: this.intervals.variance(),
      pasteCount: this.pasteCount,
    }
  }

  reset(): void {
    this.keydownCount = 0
    this.keyupCount = 0
    this.pasteCount = 0
    this.intervals.reset()
  }
}
