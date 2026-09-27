export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function nowMs(): number {
  return Date.now()
}

export function perfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Cryptographically secure random id with prefix. */
export function secureId(prefix: string, bytes = 16): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr)
  } else {
    throw new Error('Secure random generation is unavailable')
  }
  let hex = ''
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i]!.toString(16).padStart(2, '0')
  }
  return `${prefix}_${hex}`
}

export function debugLog(enabled: boolean, ...args: unknown[]): void {
  if (enabled && typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[bot-detector-client]', ...args)
  }
}

export class IntervalTracker {
  private lastAt: number | null = null
  private sum = 0
  private count = 0
  private min: number | null = null
  private max: number | null = null
  private sumSq = 0

  mark(t: number): void {
    if (this.lastAt != null) {
      const interval = t - this.lastAt
      if (interval >= 0) {
        this.sum += interval
        this.sumSq += interval * interval
        this.count += 1
        this.min = this.min == null ? interval : Math.min(this.min, interval)
        this.max = this.max == null ? interval : Math.max(this.max, interval)
      }
    }
    this.lastAt = t
  }

  average(): number | null {
    return this.count === 0 ? null : this.sum / this.count
  }

  minInterval(): number | null {
    return this.min
  }

  maxInterval(): number | null {
    return this.max
  }

  variance(): number | null {
    if (this.count < 2) return null
    const mean = this.sum / this.count
    return this.sumSq / this.count - mean * mean
  }

  reset(): void {
    this.lastAt = null
    this.sum = 0
    this.count = 0
    this.min = null
    this.max = null
    this.sumSq = 0
  }
}
