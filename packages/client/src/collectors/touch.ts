import type { TouchSignals } from 'devn-bot-detector-core'
import { IntervalTracker, isBrowser, perfNow } from '../utils'

export class TouchCollector {
  private listening = false
  private touchCount = 0
  private multiTouchCount = 0
  private activeDuration = 0
  private touchStartedAt: number | null = null
  private readonly intervals = new IntervalTracker()

  private readonly onStart = (e: TouchEvent): void => {
    const t = perfNow()
    this.touchCount += 1
    this.intervals.mark(t)
    this.touchStartedAt = t
    const touches = e.touches?.length ?? 0
    if (touches > 1) this.multiTouchCount += 1
  }

  private readonly onEnd = (): void => {
    if (this.touchStartedAt != null) {
      this.activeDuration += perfNow() - this.touchStartedAt
      this.touchStartedAt = null
    }
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    window.addEventListener('touchstart', this.onStart, { passive: true })
    window.addEventListener('touchend', this.onEnd, { passive: true })
    window.addEventListener('touchcancel', this.onEnd, { passive: true })
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('touchstart', this.onStart)
    window.removeEventListener('touchend', this.onEnd)
    window.removeEventListener('touchcancel', this.onEnd)
  }

  snapshot(): TouchSignals {
    return {
      touchCount: this.touchCount,
      averageInterval: this.intervals.average(),
      activeDuration: Math.round(this.activeDuration),
      multiTouchCount: this.multiTouchCount,
    }
  }

  reset(): void {
    this.touchCount = 0
    this.multiTouchCount = 0
    this.activeDuration = 0
    this.touchStartedAt = null
    this.intervals.reset()
  }
}
