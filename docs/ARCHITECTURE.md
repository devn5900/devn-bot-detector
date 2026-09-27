# Architecture

## Packages

```text
devn-bot-detector-core     types + validation (isomorphic)
devn-bot-detector-client   browser collectors + HTTP transport
devn-bot-detector-server   risk engine + sessions + tokens
```

Dependency direction:

```text
client → core
server → core
core ↛ client/server
```

## Request flow

1. Client `start()` attaches collectors
2. Client `POST /v1/session` with public `siteKey`
3. Server resolves site, validates hostname, creates session
4. Client aggregates telemetry in memory
5. Client `POST /v1/analyze` with session, sequence, nonce, telemetry
6. Server validates site, hostname, session, sequence, nonce, rate limits
7. RiskEngine runs independent detectors
8. Optional custom scoring hook
9. Decision + optional risk token returned
10. Consumer persists via `EventSink` / own DB if desired

## Extension points

| Interface | Purpose |
|-----------|---------|
| `SiteResolver` | Map public siteKey → tenant + allowed domains |
| `SessionStore` | Persist sessions (memory default for dev) |
| `RateLimiter` | Quotas by site / session / IP |
| `EventSink` | Hook analysis results into your analytics/DB |
| `customScoring` | Add application-specific risk |

## White-label / multi-tenant

Domains are **not** hard-coded in the SDK. Your app stores:

`siteKey → tenant → allowedDomains`

and implements `SiteResolver`. This scales to thousands of white-label clients without SDK changes.
