# devn-bot-detector

Framework-agnostic **behavioral risk scoring** SDK.

Browser clients collect privacy-safe interaction telemetry. Your backend analyzes it with `devn-bot-detector-server` and returns a structured risk result. Your application decides whether to allow, monitor, challenge, or block.

## What it is

- A reusable infrastructure component: **collect → transmit → validate → analyze → score → return data**
- Multi-tenant ready via `siteKey → SiteResolver → allowed domains`
- Works with any JS/TS frontend and any Node HTTP stack

## What it is not

- Not a CAPTCHA (no images, puzzles, reCAPTCHA, Turnstile, hCaptcha)
- Not cryptographic proof of humanity
- Not a database, auth system, or tenant CMS
- Not framework-locked (no Express/Nest/Adonis/Vue/React required inside packages)

## Architecture

```text
Browser                         Consumer Backend
devn-bot-detector-client  →  your HTTP routes
        │                              │
        │ telemetry                    ▼
        │                    devn-bot-detector-server
        │                              │
        │                    SiteResolver / SessionStore
        │                    RateLimiter / RiskEngine
        │                    TokenManager / EventSink
        │                              │
        └──────── RiskResult ◄─────────┘
```

## Packages

| Package | Role |
|---------|------|
| `devn-bot-detector-core` | Shared types, validation, constants |
| `devn-bot-detector-client` | Browser telemetry SDK |
| `devn-bot-detector-server` | Server risk engine (framework-independent) |

## Install

```bash
pnpm add devn-bot-detector-client
pnpm add devn-bot-detector-server
```

## Client usage

```ts
import { BotDetector } from 'devn-bot-detector-client'

const detector = new BotDetector({
  siteKey: 'site_public_xxx', // PUBLIC
  endpoint: 'https://risk.example.com',
})

await detector.start()
const result = await detector.check()

if (result.decision === 'block') {
  // reject
} else if (result.decision === 'challenge') {
  // your own challenge flow
}
```

## Server usage

```ts
import {
  BotDetectionServer,
  MemorySiteResolver,
  MemorySessionStore,
} from 'devn-bot-detector-server'

const detector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!, // PRIVATE — never ship to browsers
  siteResolver: {
    async resolveSite(siteKey) {
      return application.findSite(siteKey) // your storage
    },
  },
  sessionStore: new MemorySessionStore(), // replace in production
  eventSink: {
    async onAnalysis(result) {
      await myDatabase.save(result) // optional
    },
  },
})
```

Expose:

- `POST /v1/session`
- `POST /v1/analyze`

See `examples/` for Next.js App Router, Express, Fastify, Hono, React, Vue, and AdonisJS implementations.

## Advanced Features & Options

- **Action-Specific Risk Thresholds**: Enforce strict human bands on sensitive endpoints (e.g. `login`, `checkout`) and lenient bands on public browsing.
- **One-Time Token Consumption & Anti-Replay**: Prevent token reuse on payment or auth endpoints with `consumeRiskToken()`.
- **IP Allowlist & Denylist**: Direct CIDR, exact IP, and wildcard matching for trusted runners and malicious proxy blocking.
- **Software WebGL & Headless Anomaly Detection**: Uncovers SwiftShader/llvmpipe virtualized GPUs, Chrome object tampering, and desktop plugin discrepancies.
- **Robotic Cursor Entropy Analysis**: Identifies unnatural linear paths and zero-variance pointer trajectories.
- **Production Redis Adapters**: Out-of-the-box `RedisSessionStore`, `RedisRateLimiter`, and `RedisTokenRevocationStore`.
- **Client Network Resiliency**: Built-in exponential backoff retries, configurable timeouts, dynamic headers provider, and traffic sampling (`sampleRate`).
- **Framework Middleware & Helpers**: Prebuilt middleware for Express, Fastify, Hono, and universal token verification for Next.js Server Actions and NestJS guards.

## Security model

- Browser never decides human/bot — only sends telemetry
- Server validates site key, hostname, session, sequence, nonce
- Cryptographic HMAC-SHA256 risk tokens bound to action, session, and timestamps
- One-time token consumption prevents replay attacks
- Rate limiting (in-memory default; Redis adapter available)
- `trustProxy` defaults to `false` (do not blindly trust `X-Forwarded-For`)
- Payload size limits + forbidden sensitive field rejection

## Privacy model

Never collected: passwords, typed characters, clipboard, cookies, storage, DOM text, auth tokens.

Only aggregated metadata: counts, intervals, distances, durations, coarse browser capabilities.

## Risk scoring

Suggested human-score bands (configurable per server or per action):

| Score | Decision |
|------:|----------|
| ≥ 70 | `allow` |
| ≥ 50 | `monitor` |
| ≥ 30 | `challenge` |
| < 30 | `block` |

`navigator.webdriver` is **one signal among many** — never decisive alone.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

```bash
pnpm --filter devn-bot-detector-core build
pnpm --filter devn-bot-detector-client build
pnpm --filter devn-bot-detector-server build
```

## Documentation

- [📖 Universal Implementation Guide (React, Next.js, Vue, Nuxt, SvelteKit, Angular, Express, Fastify, Hono, NestJS)](docs/IMPLEMENTATION_GUIDE.md)
- [⚙️ Advanced Options & Architecture Reference](docs/ADVANCED_OPTIONS.md)
- [📦 Publishing to npm Guide](docs/PUBLISHING.md)
- [🛡️ Security Model](docs/SECURITY.md)
- [🔒 Privacy Model](docs/PRIVACY.md)
- [🏛️ Architecture Overview](docs/ARCHITECTURE.md)

## License

MIT

