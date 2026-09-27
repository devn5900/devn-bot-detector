# Security

## Trust boundaries

1. **Browser is untrusted.** Clients can forge telemetry. Never accept a client-supplied `decision`.
2. **`siteKey` is public.** Anyone can read it from frontend code. Authorization comes from server `secret`, hostname allowlists, sessions, and rate limits.
3. **Server `secret` is private.** Used only for HMAC risk tokens. Never embed it in the client bundle.

## Session & replay protection

- Sessions are short-lived and stored via `SessionStore` (in-memory default for dev only).
- Analyze requests require a strictly increasing `sequence`.
- Optional `nonce` values are single-use within a session.
- Expired sessions are rejected (`SESSION_EXPIRED`).

## Hostname validation

- Hostname from the browser is compared against application-provided `allowedDomains`.
- When `Origin` is present, it must also match the allowlist.
- Do not treat browser-reported hostname as authoritative without allowlist checks.

## Risk tokens

- Format: `rt_<base64url(payload)>.<base64url(hmac-sha256)>`
- Payload includes `requestId`, `siteId`, `sessionId`, `decision`, `issuedAt`, `expiresAt`
- Verified with timing-safe comparison
- Never put telemetry or PII inside tokens
- Verify tokens again before sensitive operations

## Proxy headers

`trustProxy` defaults to `false`. Only enable when your process sits behind a trusted reverse proxy; otherwise attackers can spoof `X-Forwarded-For` for rate-limit bypass.

## Rate limiting

Default limiter is in-memory (per process). For multi-instance production, inject your own `RateLimiter` (Redis, etc.). The SDK does not require Redis.

## Fail-open (client)

Client `failOpen: true` (default) returns `decision: 'monitor'` when the risk API is unreachable, so an outage does not lock out legitimate users. Set `failOpen: false` only if your product can tolerate hard failures.

## What this is not

This is risk scoring, not proof of humanity. Combine with your own abuse systems, auth, and (if needed) application-owned challenges.
