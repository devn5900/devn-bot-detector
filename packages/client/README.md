# @devn/bot-detector-client

Browser SDK that collects **aggregated, privacy-safe** interaction telemetry and requests a risk score from your backend.

## Install

```bash
pnpm add @devn/bot-detector-client
```

## Usage

```ts
import { BotDetector } from '@devn/bot-detector-client'

const detector = new BotDetector({
  siteKey: 'site_public_xxx',
  endpoint: 'https://risk.example.com',
})

await detector.start()

const result = await detector.check()

if (result.decision === 'block') {
  // reject
}
```

## Privacy

Never collects passwords, typed characters, clipboard contents, cookies, storage, or DOM text.
Only statistical metadata (counts, intervals, distances).

## Methods

- `start()` / `check()` / `getSession()` / `getTelemetry()` / `reset()` / `destroy()`
