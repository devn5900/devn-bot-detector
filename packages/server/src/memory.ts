import { randomBytes } from 'node:crypto'
import type { SessionData, SiteInfo } from 'devn-bot-detector-core'
import type { SessionStore, SiteResolver, TokenRevocationStore } from './interfaces'

export function secureId(prefix: string, bytes = 16): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`
}

/** In-memory site resolver for development/testing only. */
export class MemorySiteResolver implements SiteResolver {
  private readonly sites = new Map<string, SiteInfo>()

  constructor(entries: Array<{ siteKey: string; site: SiteInfo }> = []) {
    for (const entry of entries) {
      this.sites.set(entry.siteKey, entry.site)
    }
  }

  set(siteKey: string, site: SiteInfo): void {
    this.sites.set(siteKey, site)
  }

  async resolveSite(siteKey: string): Promise<SiteInfo | null> {
    return this.sites.get(siteKey) ?? null
  }
}

/** In-memory session store for development/testing only. */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>()

  async create(session: SessionData): Promise<void> {
    this.sessions.set(session.sessionId, {
      ...session,
      usedNonces: [...session.usedNonces],
    })
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return {
      ...s,
      usedNonces: [...s.usedNonces],
    }
  }

  async update(session: SessionData): Promise<void> {
    this.sessions.set(session.sessionId, {
      ...session,
      usedNonces: [...session.usedNonces],
    })
  }

  async invalidate(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }
}

/** In-memory token revocation store for single-instance / dev usage. */
export class MemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revoked = new Map<string, number>()

  isRevoked(tokenId: string): boolean {
    const expiresAt = this.revoked.get(tokenId)
    if (!expiresAt) return false
    if (Date.now() >= expiresAt) {
      this.revoked.delete(tokenId)
      return false
    }
    return true
  }

  revoke(tokenId: string, ttlMs: number): void {
    this.revoked.set(tokenId, Date.now() + Math.max(1000, ttlMs))
  }
}

