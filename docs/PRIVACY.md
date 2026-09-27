# Privacy

## Design goal

Collect the minimum behavioral metadata needed for risk scoring. Do not collect content.

## Never collected

- Password values
- Form field values
- Keyboard characters (`event.key`, `event.code`)
- Clipboard contents
- Typed text
- Page / DOM contents
- Cookies
- Authentication tokens
- `localStorage` / `sessionStorage` contents
- Raw mouse coordinate histories
- Raw scroll coordinate streams

## What is collected

Aggregated statistics only, for example:

- Pointer: event counts, distance, interval stats, direction changes, idle periods
- Keyboard: keydown/keyup counts, interval stats, variance, paste **count**
- Touch / scroll / focus / visibility: counts and durations
- Browser: UA string, language, timezone, screen size, `webdriver` flag, etc.

## Telemetry size

Default max payload: **32 KB**. Oversized payloads are slimmed on the client and rejected on the server.

## Application responsibilities

- Publish a privacy notice covering behavioral telemetry
- Prefer short retention if you persist `RiskResult` via `EventSink`
- Do not log full telemetry in production debug logs
- Hash or avoid storing raw IPs if you add persistent tracking outside the SDK
