import type { VisibilitySignals } from 'devn-bot-detector-core'
import { isBrowser, nowMs } from '../utils'

export class VisibilityCollector {
  private listening = false
  private visibilityChanges = 0
  private visibleDuration = 0
  private hiddenDuration = 0
  private segmentStartedAt = nowMs()
  private currentlyHidden = false

  private readonly onChange = (): void => {
    const t = nowMs()
    const elapsed = t - this.segmentStartedAt
    if (this.currentlyHidden) this.hiddenDuration += elapsed
    else this.visibleDuration += elapsed
    this.currentlyHidden = document.visibilityState === 'hidden'
    this.segmentStartedAt = t
    this.visibilityChanges += 1
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    this.currentlyHidden = document.visibilityState === 'hidden'
    this.segmentStartedAt = nowMs()
    document.addEventListener('visibilitychange', this.onChange)
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    document.removeEventListener('visibilitychange', this.onChange)
    this.flush()
  }

  snapshot(): VisibilitySignals {
    this.flush()
    return {
      visibilityChanges: this.visibilityChanges,
      visibleDuration: Math.round(this.visibleDuration),
      hiddenDuration: Math.round(this.hiddenDuration),
    }
  }

  reset(): void {
    this.visibilityChanges = 0
    this.visibleDuration = 0
    this.hiddenDuration = 0
    this.segmentStartedAt = nowMs()
    this.currentlyHidden = isBrowser() ? document.visibilityState === 'hidden' : false
  }

  private flush(): void {
    const t = nowMs()
    const elapsed = t - this.segmentStartedAt
    if (this.currentlyHidden) this.hiddenDuration += elapsed
    else this.visibleDuration += elapsed
    this.segmentStartedAt = t
  }
}
