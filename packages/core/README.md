# devn-bot-detector-core

Shared types, constants, validation, and protocol helpers.

**No browser APIs. No Node APIs.** Safe to import from both client and server packages.

## Install

```bash
pnpm add devn-bot-detector-core
```

## Contents

- Types: `Telemetry`, `RiskResult`, `SessionData`, `ClientConfig`, `ServerConfig`, …
- Constants: thresholds, API paths, error codes, payload limits
- Validation: `validateTelemetry`, `validateAnalyzeRequest`, `validateCreateSessionRequest`
- Helpers: `decisionFromScore`, `hostnameAllowed`, `BotDetectorError`

This package never collects data or scores risk — it only defines the contract.
