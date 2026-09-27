import { SITE_KEY_HEADER, type ClientCredentialsMode } from 'devn-bot-detector-core'

export interface HttpTransportOptions {
  readonly baseUrl: string
  readonly siteKey: string
  readonly timeoutMs?: number
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
  readonly fetchFn?: typeof fetch
  readonly credentials?: ClientCredentialsMode
  readonly retries?: number
  readonly retryDelayMs?: number
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class HttpTransport {
  private readonly baseUrl: string
  private readonly siteKey: string
  private readonly timeoutMs: number
  private readonly headersProvider?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
  private readonly fetchFn: typeof fetch
  private readonly credentials: ClientCredentialsMode
  private readonly retries: number
  private readonly retryDelayMs: number

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.siteKey = options.siteKey
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.headersProvider = options.headers
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
    this.credentials = options.credentials ?? 'omit'
    this.retries = Math.max(0, options.retries ?? 0)
    this.retryDelayMs = options.retryDelayMs ?? 300
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.executeWithRetry<T>('POST', path, body)
  }

  async get<T>(path: string): Promise<T> {
    return this.executeWithRetry<T>('GET', path)
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    if (!this.headersProvider) return {}
    if (typeof this.headersProvider === 'function') {
      return (await this.headersProvider()) ?? {}
    }
    return this.headersProvider
  }

  private async executeWithRetry<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.request<T>(method, path, body)
      } catch (err) {
        lastError = err
        if (attempt < this.retries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt)
          await wait(delay)
        }
      }
    }
    throw lastError
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const customHeaders = await this.resolveHeaders()
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          [SITE_KEY_HEADER]: this.siteKey,
          ...customHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: this.credentials,
      })

      const text = await res.text()
      let data: unknown = null
      if (text) {
        try {
          data = JSON.parse(text) as unknown
        } catch {
          throw new Error(`Invalid JSON response (${res.status})`)
        }
      }

      if (!res.ok) {
        const message =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as { error?: { message?: unknown } }).error?.message === 'string'
            ? (data as { error: { message: string } }).error.message
            : `HTTP ${res.status}`
        throw new Error(message)
      }

      return data as T
    } finally {
      clearTimeout(timer)
    }
  }
}

