import type { InteractionSignals } from 'devn-bot-detector-core'
import { isBrowser, nowMs } from '../utils'

export class InteractionCollector {
  private listening = false
  private pageLoadTime = nowMs()
  private firstInteractionTime: number | null = null
  private clickCount = 0
  private interactionCount = 0
  private formInteractionCount = 0
  private scrollCount = 0
  private focusCount = 0

  private readonly markInteraction = (): void => {
    if (this.firstInteractionTime == null) {
      this.firstInteractionTime = nowMs()
    }
    this.interactionCount += 1
  }

  private readonly onClick = (): void => {
    this.clickCount += 1
    this.markInteraction()
  }

  private readonly onKey = (): void => {
    this.markInteraction()
  }

  private readonly onTouch = (): void => {
    this.markInteraction()
  }

  private readonly onScroll = (): void => {
    this.scrollCount += 1
    this.markInteraction()
  }

  private readonly onFocusIn = (e: FocusEvent): void => {
    this.focusCount += 1
    const target = e.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      // Count only — never read values.
      this.formInteractionCount += 1
    }
  }

  start(): void {
    if (this.listening || !isBrowser()) return
    this.listening = true
    this.pageLoadTime = nowMs()
    window.addEventListener('click', this.onClick, { passive: true })
    window.addEventListener('keydown', this.onKey, { passive: true })
    window.addEventListener('touchstart', this.onTouch, { passive: true })
    window.addEventListener('scroll', this.onScroll, { passive: true })
    document.addEventListener('focusin', this.onFocusIn, { passive: true })
  }

  stop(): void {
    if (!this.listening || !isBrowser()) return
    this.listening = false
    window.removeEventListener('click', this.onClick)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('touchstart', this.onTouch)
    window.removeEventListener('scroll', this.onScroll)
    document.removeEventListener('focusin', this.onFocusIn)
  }

  snapshot(): InteractionSignals {
    return {
      pageLoadTime: this.pageLoadTime,
      firstInteractionTime: this.firstInteractionTime,
      timeToFirstInteraction:
        this.firstInteractionTime != null
          ? this.firstInteractionTime - this.pageLoadTime
          : null,
      clickCount: this.clickCount,
      interactionCount: this.interactionCount,
      formInteractionCount: this.formInteractionCount,
      scrollCount: this.scrollCount,
      focusCount: this.focusCount,
    }
  }

  reset(): void {
    this.pageLoadTime = nowMs()
    this.firstInteractionTime = null
    this.clickCount = 0
    this.interactionCount = 0
    this.formInteractionCount = 0
    this.scrollCount = 0
    this.focusCount = 0
  }
}
