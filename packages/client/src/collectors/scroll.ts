import type { ScrollSignals } from 'devn-bot-detector-core'
import { IntervalTracker, isBrowser, perfNow } from '../utils'

export class ScrollCollector {
  private listening = false
  private scrollCount = 0
  private totalDistance = 0
  private directionChanges = 0
  private activeDuration = 0
  private lastY: number | null = null
  private lastDir: number | null = null
  private lastAt: number | null = null
  private activityStartedAt: number | null = null
  private readonly intervals = new IntervalTracker()
  private scheduled = false

  private readonly onScroll = (): void => {
    if (this.scheduled) return
    this.scheduled = true
    const run = (): void => {
      this.scheduled = false
      this.handleScroll()
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run)
    } else {
      setTimeout(run, 16)
    }
  }

  private handleScroll(): void {
    const t = perfNow()
    const y = typeof window !== 'undefined' ? window.scrollY || 0 : 0
    this.scrollCount += 1
    this.intervals.mark(t)

    if (this.lastY != null) {
      const dy = y - this.lastY
      this.totalDistance += Math.abs(dy)
      const dir = dy === 0 ? 0 : dy > 0 ? 1 : -1
      if (dir !== 0 && this.lastDir != null && dir !== this.lastDir) {
        this.directionChanges += 1
      }
      if (dir !== 0) this.lastDir = dir
    }

    if (this.activityStartedAt == null) this.activityStartedAt = t
    if (this.lastAt != null && t - this.lastAt > 800) {
      this.activeDuration += this.lastAt - this.activityStartedAt
      this.activityStartedAt = t
    }

    this.lastY = y
    this.lastAt = t
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    window.addEventListener('scroll', this.onScroll, { passive: true })
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('scroll', this.onScroll)
    if (this.activityStartedAt != null && this.lastAt != null) {
      this.activeDuration += this.lastAt - this.activityStartedAt
      this.activityStartedAt = this.lastAt
    }
  }

  snapshot(): ScrollSignals {
    return {
      scrollCount: this.scrollCount,
      averageInterval: this.intervals.average(),
      totalDistance: Math.round(this.totalDistance),
      directionChanges: this.directionChanges,
      activeDuration: Math.round(this.activeDuration),
    }
  }

  reset(): void {
    this.scrollCount = 0
    this.totalDistance = 0
    this.directionChanges = 0
    this.activeDuration = 0
    this.lastY = null
    this.lastDir = null
    this.lastAt = null
    this.activityStartedAt = null
    this.intervals.reset()
  }
}
