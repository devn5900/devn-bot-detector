import type { PointerSignals } from 'devn-bot-detector-core'
import { IntervalTracker, isBrowser, perfNow } from '../utils'

const IDLE_GAP_MS = 1500

export class PointerCollector {
  private listening = false
  private eventCount = 0
  private movementDistance = 0
  private directionChanges = 0
  private idlePeriods = 0
  private clickCount = 0
  private activeDuration = 0
  private lastX: number | null = null
  private lastY: number | null = null
  private lastAngle: number | null = null
  private lastEventAt: number | null = null
  private activityStartedAt: number | null = null
  private readonly intervals = new IntervalTracker()

  private readonly onMove = (e: PointerEvent | MouseEvent): void => {
    const t = perfNow()
    const x = e.clientX
    const y = e.clientY
    this.eventCount += 1
    this.intervals.mark(t)

    if (this.lastEventAt != null && t - this.lastEventAt > IDLE_GAP_MS) {
      this.idlePeriods += 1
      if (this.activityStartedAt != null) {
        this.activeDuration += this.lastEventAt - this.activityStartedAt
      }
      this.activityStartedAt = t
    } else if (this.activityStartedAt == null) {
      this.activityStartedAt = t
    }

    if (this.lastX != null && this.lastY != null) {
      const dx = x - this.lastX
      const dy = y - this.lastY
      const dist = Math.hypot(dx, dy)
      this.movementDistance += dist
      if (dist > 2) {
        const angle = Math.atan2(dy, dx)
        if (this.lastAngle != null) {
          let delta = Math.abs(angle - this.lastAngle)
          if (delta > Math.PI) delta = 2 * Math.PI - delta
          if (delta > 0.6) this.directionChanges += 1
        }
        this.lastAngle = angle
      }
    }

    this.lastX = x
    this.lastY = y
    this.lastEventAt = t
    // Do not retain coordinate history — only last point for deltas.
  }

  private readonly onClick = (): void => {
    this.clickCount += 1
    this.eventCount += 1
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('click', this.onClick, { passive: true })
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('click', this.onClick)
    this.flushActive()
  }

  snapshot(): PointerSignals {
    this.flushActive()
    return {
      eventCount: this.eventCount,
      movementDistance: Math.round(this.movementDistance),
      averageInterval: this.intervals.average(),
      minInterval: this.intervals.minInterval(),
      maxInterval: this.intervals.maxInterval(),
      directionChanges: this.directionChanges,
      idlePeriods: this.idlePeriods,
      activeDuration: Math.round(this.activeDuration),
      clickCount: this.clickCount,
    }
  }

  reset(): void {
    this.eventCount = 0
    this.movementDistance = 0
    this.directionChanges = 0
    this.idlePeriods = 0
    this.clickCount = 0
    this.activeDuration = 0
    this.lastX = null
    this.lastY = null
    this.lastAngle = null
    this.lastEventAt = null
    this.activityStartedAt = null
    this.intervals.reset()
  }

  private flushActive(): void {
    if (this.activityStartedAt != null && this.lastEventAt != null) {
      this.activeDuration += this.lastEventAt - this.activityStartedAt
      this.activityStartedAt = this.lastEventAt
    }
  }
}
