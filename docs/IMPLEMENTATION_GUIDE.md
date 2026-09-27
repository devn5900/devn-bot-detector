# Universal Implementation Guide: Implementing Bot Detector in Different Projects

This guide provides end-to-end, copy-pasteable integration code for every major web frontend and backend stack.

---

## Table of Contents

1. [Architectural Overview & Integration Patterns](#architectural-overview--integration-patterns)
2. [Frontend Implementations](#frontend-implementations)
   - [React (Vite / CRA / SPA)](#1-react-vite--cra--spa)
   - [Next.js (App Router)](#2-nextjs-app-router)
   - [Next.js (Pages Router)](#3-nextjs-pages-router)
   - [Vue 3 / Vite](#4-vue-3--vite)
   - [Nuxt 3](#5-nuxt-3)
   - [SvelteKit](#6-sveltekit)
   - [Angular](#7-angular)
   - [Vanilla JavaScript & HTML](#8-vanilla-javascript--html)
3. [Backend Framework Implementations](#backend-framework-implementations)
   - [Express.js](#1-expressjs)
   - [Fastify](#2-fastify)
   - [Hono (Node, Bun, Deno, Cloudflare Workers)](#3-hono-node-bun-deno-cloudflare-workers)
   - [NestJS](#4-nestjs)
   - [AdonisJS](#5-adonisjs)
4. [Protecting Sensitive Endpoints (HMAC Risk Tokens)](#protecting-sensitive-endpoints-hmac-risk-tokens)

---

## Architectural Overview & Integration Patterns

There are two primary ways to integrate `@devn/bot-detector`:

### Pattern A: Action-Gated Flow (Recommended for Forms & APIs)

```text
Browser Client                         Your Server API
      │                                       │
      │ 1. Telemetry collected in background  │
      │                                       │
      │ 2. User clicks "Sign In" or "Pay"     │
      │ 3. detector.checkAction('login')      │
      ├──────────────────────────────────────►│ (POST /v1/analyze)
      │◄──────────────────────────────────────┤ Returns RiskResult + riskToken
      │                                       │
      │ 4. Submit form + riskToken            │
      ├──────────────────────────────────────►│ (POST /api/login)
      │                                       │ 5. server.consumeRiskToken(token)
      │                                       │ 6. Process login or reject
      │◄──────────────────────────────────────┤
```

### Pattern B: Continuous Session Monitoring

The client streams periodic telemetry checks (e.g., every 10–30s or on page navigation), useful for monitoring scraping bots or automated crawlers traversing multiple pages.

---

## Frontend Implementations

### 1. React (Vite / CRA / SPA)

Create a custom React hook `useBotDetector.ts`:

```tsx
// src/hooks/useBotDetector.ts
import { useEffect, useRef, useState, useCallback } from 'react'
import { BotDetector, type RiskResult, type CheckOptions } from '@devn/bot-detector-client'

export interface UseBotDetectorOptions {
  siteKey: string
  endpoint: string
  autoStart?: boolean
}

export function useBotDetector(options: UseBotDetectorOptions) {
  const detectorRef = useRef<BotDetector | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [lastRisk, setLastRisk] = useState<RiskResult | null>(null)

  useEffect(() => {
    const detector = new BotDetector({
      siteKey: options.siteKey,
      endpoint: options.endpoint,
      autoStart: options.autoStart ?? true,
      failOpen: true,
      onSessionCreated: () => setIsReady(true),
      onCheck: (res) => setLastRisk(res),
    })

    detectorRef.current = detector

    return () => {
      detector.destroy()
    }
  }, [options.siteKey, options.endpoint, options.autoStart])

  const check = useCallback(async (opts?: CheckOptions): Promise<RiskResult | null> => {
    if (!detectorRef.current) return null
    return detectorRef.current.check(opts)
  }, [])

  const checkAction = useCallback(async (action: string, metadata?: Record<string, unknown>): Promise<RiskResult | null> => {
    if (!detectorRef.current) return null
    return detectorRef.current.checkAction(action, metadata)
  }, [])

  return {
    detector: detectorRef.current,
    isReady,
    lastRisk,
    check,
    checkAction,
  }
}
```

#### Usage in a React Form Component:

```tsx
// src/components/LoginForm.tsx
import React, { useState } from 'react'
import { useBotDetector } from '../hooks/useBotDetector'

export function LoginForm() {
  const { checkAction, isReady } = useBotDetector({
    siteKey: import.meta.env.VITE_BOT_SITE_KEY,
    endpoint: import.meta.env.VITE_BOT_ENDPOINT, // e.g. '/api/bot'
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 1. Evaluate risk for action 'login'
      const risk = await checkAction('login')

      if (risk?.decision === 'block') {
        setError('Submission blocked. Automated behavior detected.')
        setLoading(false)
        return
      }

      // 2. Submit form with the riskToken
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Risk-Token': risk?.riskToken ?? '',
        },
        body: JSON.stringify({
          email: e.currentTarget.email.value,
          password: e.currentTarget.password.value,
        }),
      })

      if (!response.ok) {
        throw new Error('Invalid credentials')
      }

      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit" disabled={!isReady || loading}>
        {loading ? 'Verifying...' : 'Sign In'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  )
}
```

---

### 2. Next.js (App Router)

#### Step 1: Initialize Server Singleton (`lib/bot-detector.ts`)

```ts
// lib/bot-detector.ts
import {
  BotDetectionServer,
  MemorySessionStore,
  MemorySiteResolver,
  MemoryTokenRevocationStore,
} from '@devn/bot-detector-server'

export const serverDetector = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    {
      siteKey: process.env.NEXT_PUBLIC_BOT_SITE_KEY!,
      site: {
        siteId: 'site_1',
        tenantId: 'tenant_1',
        allowedDomains: ['localhost', 'example.com'],
        status: 'active',
      },
    },
  ]),
  sessionStore: new MemorySessionStore(), // Use RedisSessionStore in production
  tokenRevocationStore: new MemoryTokenRevocationStore(),
  actionThresholds: {
    login: { allow: 80, monitor: 60, challenge: 40 },
    checkout: { allow: 85, monitor: 70, challenge: 50 },
  },
  trustProxy: true,
})
```

#### Step 2: Route Handlers (`app/api/bot/session/route.ts` & `app/api/bot/analyze/route.ts`)

```ts
// app/api/bot/session/route.ts
import { NextResponse } from 'next/server'
import { BotDetectorError, SITE_KEY_HEADER } from '@devn/bot-detector-server'
import { serverDetector } from '@/lib/bot-detector'

export async function POST(req: Request) {
  try {
    const siteKey = req.headers.get(SITE_KEY_HEADER.toLowerCase()) || req.headers.get(SITE_KEY_HEADER) || ''
    const body = await req.json()
    const result = await serverDetector.createSession({
      siteKey,
      ...body,
      request: {
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        origin: req.headers.get('origin') || undefined,
        host: req.headers.get('host') || undefined,
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) {
      return NextResponse.json(err.toJSON(), { status: err.code === 'RATE_LIMITED' ? 429 : 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, { status: 500 })
  }
}
```

```ts
// app/api/bot/analyze/route.ts
import { NextResponse } from 'next/server'
import { BotDetectorError, SITE_KEY_HEADER } from '@devn/bot-detector-server'
import { serverDetector } from '@/lib/bot-detector'

export async function POST(req: Request) {
  try {
    const siteKey = req.headers.get(SITE_KEY_HEADER.toLowerCase()) || req.headers.get(SITE_KEY_HEADER) || ''
    const body = await req.json()
    const result = await serverDetector.analyze({
      siteKey,
      ...body,
      request: {
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        origin: req.headers.get('origin') || undefined,
        host: req.headers.get('host') || undefined,
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) {
      return NextResponse.json(err.toJSON(), { status: err.code === 'RATE_LIMITED' ? 429 : 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, { status: 500 })
  }
}
```

#### Step 3: Server Action with Token Consumption (`app/actions.ts`)

```ts
// app/actions.ts
'use server'

import { serverDetector } from '@/lib/bot-detector'

export async function submitPaymentAction(formData: FormData) {
  const riskToken = String(formData.get('riskToken') || '')

  try {
    // Atomically consumes one-time token and asserts expected action
    const token = await serverDetector.consumeRiskToken(riskToken, {
      expectedAction: 'checkout',
      maxAgeMs: 120_000,
    })

    if (token.decision === 'block') {
      return { success: false, error: 'Transaction rejected by risk policy.' }
    }

    // Process payment...
    return { success: true }
  } catch (err: any) {
    return { success: false, error: 'Verification error or token expired.' }
  }
}
```

---

### 3. Next.js (Pages Router)

Catch-all API Route `pages/api/bot/[...route].ts`:

```ts
// pages/api/bot/[...route].ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { BotDetectorError, SITE_KEY_HEADER } from '@devn/bot-detector-server'
import { serverDetector } from '@/lib/bot-detector'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const subpath = Array.isArray(req.query.route) ? req.query.route.join('/') : req.query.route
  const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] || '')
  const requestContext = {
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    origin: req.headers['origin'] as string | undefined,
    host: req.headers['host'],
    forwardedFor: req.headers['x-forwarded-for'] as string | undefined,
  }

  try {
    if (subpath === 'session') {
      const result = await serverDetector.createSession({
        siteKey,
        ...req.body,
        request: requestContext,
      })
      return res.status(200).json(result)
    }

    if (subpath === 'analyze') {
      const result = await serverDetector.analyze({
        siteKey,
        ...req.body,
        request: requestContext,
      })
      return res.status(200).json(result)
    }

    return res.status(404).json({ error: 'Not found' })
  } catch (err) {
    if (err instanceof BotDetectorError) {
      return res.status(err.code === 'RATE_LIMITED' ? 429 : 400).json(err.toJSON())
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } })
  }
}
```

---

### 4. Vue 3 / Vite

Create composable `src/composables/useBotDetector.ts`:

```ts
// src/composables/useBotDetector.ts
import { ref, onMounted, onUnmounted } from 'vue'
import { BotDetector, type RiskResult, type CheckOptions } from '@devn/bot-detector-client'

export function useBotDetector(siteKey: string, endpoint = '/api/bot') {
  const detector = ref<BotDetector | null>(null)
  const isReady = ref(false)
  const lastResult = ref<RiskResult | null>(null)

  onMounted(() => {
    detector.value = new BotDetector({
      siteKey,
      endpoint,
      autoStart: true,
      onSessionCreated: () => {
        isReady.value = true
      },
      onCheck: (res) => {
        lastResult.value = res
      },
    })
  })

  onUnmounted(() => {
    detector.value?.destroy()
  })

  const checkAction = async (action: string, metadata?: Record<string, unknown>) => {
    return detector.value?.checkAction(action, metadata)
  }

  return {
    detector,
    isReady,
    lastResult,
    checkAction,
  }
}
```

#### Inside a Vue Component (`Login.vue`):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useBotDetector } from './composables/useBotDetector'

const { checkAction, isReady } = useBotDetector(import.meta.env.VITE_BOT_SITE_KEY)
const email = ref('')
const password = ref('')
const status = ref('')

async function onSubmit() {
  status.value = 'Analyzing signals...'
  const risk = await checkAction('login')

  if (risk?.decision === 'block') {
    status.value = 'Blocked by automated risk policy.'
    return
  }

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Risk-Token': risk?.riskToken || '',
    },
    body: JSON.stringify({ email: email.value, password: password.value }),
  })

  status.value = res.ok ? 'Logged in successfully!' : 'Login failed.'
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input v-model="email" type="email" placeholder="Email" required />
    <input v-model="password" type="password" placeholder="Password" required />
    <button type="submit" :disabled="!isReady">Submit</button>
    <p v-if="status">{{ status }}</p>
  </form>
</template>
```

---

### 5. Nuxt 3

Nuxt Server Route `server/api/bot/[...].ts`:

```ts
// server/api/bot/[...].ts
import { BotDetectionServer, BotDetectorError, MemorySessionStore, MemorySiteResolver, SITE_KEY_HEADER } from '@devn/bot-detector-server'

const server = new BotDetectionServer({
  secret: useRuntimeConfig().botDetectorSecret,
  siteResolver: new MemorySiteResolver([
    {
      siteKey: useRuntimeConfig().public.botSiteKey,
      site: { siteId: 'nuxt_1', tenantId: 't1', allowedDomains: ['localhost'], status: 'active' },
    },
  ]),
  sessionStore: new MemorySessionStore(),
})

export default defineEventHandler(async (event) => {
  const method = getMethod(event)
  if (method !== 'POST') throw createError({ statusCode: 405 })

  const path = event.context.params?._ || ''
  const siteKey = getHeader(event, SITE_KEY_HEADER) || ''
  const body = await readBody(event)
  const reqContext = {
    ip: getRequestIP(event),
    userAgent: getHeader(event, 'user-agent'),
    origin: getHeader(event, 'origin'),
  }

  try {
    if (path === 'session') {
      return await server.createSession({ siteKey, ...body, request: reqContext })
    }
    if (path === 'analyze') {
      return await server.analyze({ siteKey, ...body, request: reqContext })
    }
    throw createError({ statusCode: 404 })
  } catch (err: any) {
    if (err instanceof BotDetectorError) {
      throw createError({ statusCode: err.code === 'RATE_LIMITED' ? 429 : 400, statusMessage: err.message, data: err.toJSON() })
    }
    throw createError({ statusCode: 500, statusMessage: 'Internal Error' })
  }
})
```

---

### 6. SvelteKit

Server endpoint `src/routes/api/bot/[route]/+server.ts`:

```ts
// src/routes/api/bot/[route]/+server.ts
import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { BotDetectorError, SITE_KEY_HEADER } from '@devn/bot-detector-server'
import { serverDetector } from '$lib/server/bot'

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
  const siteKey = request.headers.get(SITE_KEY_HEADER.toLowerCase()) ?? ''
  const body = await request.json()
  const reqContext = {
    ip: getClientAddress(),
    userAgent: request.headers.get('user-agent') ?? undefined,
    origin: request.headers.get('origin') ?? undefined,
  }

  try {
    if (params.route === 'session') {
      const res = await serverDetector.createSession({ siteKey, ...body, request: reqContext })
      return json(res)
    }
    if (params.route === 'analyze') {
      const res = await serverDetector.analyze({ siteKey, ...body, request: reqContext })
      return json(res)
    }
    throw error(404, 'Not found')
  } catch (err) {
    if (err instanceof BotDetectorError) {
      throw error(err.code === 'RATE_LIMITED' ? 429 : 400, err.message)
    }
    throw error(500, 'Internal Server Error')
  }
}
```

---

### 7. Angular

Create an Injectable Service `bot-detector.service.ts`:

```ts
// src/app/services/bot-detector.service.ts
import { Injectable, OnDestroy } from '@angular/core'
import { BotDetector, type RiskResult } from '@devn/bot-detector-client'
import { BehaviorSubject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class BotDetectorService implements OnDestroy {
  private detector: BotDetector | null = null
  public readonly isReady$ = new BehaviorSubject<boolean>(false)

  init(siteKey: string, endpoint = '/api/bot') {
    if (this.detector) return
    this.detector = new BotDetector({
      siteKey,
      endpoint,
      autoStart: true,
      onSessionCreated: () => this.isReady$.next(true),
    })
  }

  async checkAction(action: string): Promise<RiskResult | null> {
    if (!this.detector) return null
    return this.detector.checkAction(action)
  }

  ngOnDestroy() {
    this.detector?.destroy()
  }
}
```

---

### 8. Vanilla JavaScript & HTML

Embed with ES modules or bundled script:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login</title>
</head>
<body>
  <form id="loginForm">
    <input type="email" id="email" placeholder="Email" required />
    <input type="password" id="password" placeholder="Password" required />
    <button type="submit" id="submitBtn">Sign In</button>
  </form>

  <script type="module">
    import { BotDetector } from '/dist/client.js' // or CDN bundle

    const detector = new BotDetector({
      siteKey: 'site_public_xxx',
      endpoint: 'https://api.example.com/bot',
    })

    await detector.start()

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('submitBtn')
      btn.disabled = true
      btn.textContent = 'Verifying...'

      const risk = await detector.checkAction('login')

      if (risk.decision === 'block') {
        alert('Blocked by security policy')
        btn.disabled = false
        return
      }

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Risk-Token': risk.riskToken || '',
        },
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        }),
      })

      if (res.ok) alert('Welcome!')
      else alert('Login failed')
      btn.disabled = false
    })
  </script>
</body>
</html>
```

---

## Backend Framework Implementations

### 1. Express.js

Using the built-in `createExpressBotDetector` helper:

```ts
import express from 'express'
import {
  BotDetectionServer,
  MemorySessionStore,
  MemorySiteResolver,
  MemoryTokenRevocationStore,
  createExpressBotDetector,
} from '@devn/bot-detector-server'

const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    {
      siteKey: 'site_ok',
      site: { siteId: '1', tenantId: 't1', allowedDomains: ['example.com'], status: 'active' },
    },
  ]),
  sessionStore: new MemorySessionStore(),
  tokenRevocationStore: new MemoryTokenRevocationStore(),
})

const app = express()
app.use(express.json({ limit: '64kb' }))

// Mount bot detection endpoints
const botRoutes = createExpressBotDetector(server)
app.post('/v1/session', botRoutes.sessionHandler)
app.post('/v1/analyze', botRoutes.analyzeHandler)

// Protect sensitive endpoints using token verification middleware:
app.post(
  '/api/checkout',
  botRoutes.requireRiskToken({ consume: true, expectedAction: 'checkout' }),
  (req, res) => {
    // req.riskTokenPayload is guaranteed valid and unconsumed
    res.json({ success: true, verifiedBy: req.riskTokenPayload.requestId })
  },
)

app.listen(3000, () => console.log('Listening on port 3000'))
```

---

### 2. Fastify

```ts
import Fastify from 'fastify'
import {
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from '@devn/bot-detector-server'

const fastify = Fastify({ logger: true })

const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    { siteKey: 'site_ok', site: { siteId: '1', tenantId: 't1', allowedDomains: ['localhost'], status: 'active' } },
  ]),
  sessionStore: new MemorySessionStore(),
})

fastify.post('/v1/session', async (req, reply) => {
  try {
    const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] || '')
    const result = await server.createSession({
      siteKey,
      ...(req.body as any),
      request: { ip: req.ip, userAgent: req.headers['user-agent'] },
    })
    return result
  } catch (err: any) {
    if (err instanceof BotDetectorError) return reply.status(400).send(err.toJSON())
    return reply.status(500).send({ error: 'Internal Error' })
  }
})

fastify.post('/v1/analyze', async (req, reply) => {
  try {
    const siteKey = String(req.headers[SITE_KEY_HEADER.toLowerCase()] || '')
    const result = await server.analyze({
      siteKey,
      ...(req.body as any),
      request: { ip: req.ip, userAgent: req.headers['user-agent'] },
    })
    return result
  } catch (err: any) {
    if (err instanceof BotDetectorError) return reply.status(400).send(err.toJSON())
    return reply.status(500).send({ error: 'Internal Error' })
  }
})
```

---

### 3. Hono (Node, Bun, Deno, Cloudflare Workers)

```ts
import { Hono } from 'hono'
import {
  BotDetectionServer,
  BotDetectorError,
  MemorySessionStore,
  MemorySiteResolver,
  SITE_KEY_HEADER,
} from '@devn/bot-detector-server'

const app = new Hono()

const detector = new BotDetectionServer({
  secret: 'my-super-secret-key-at-least-16-chars',
  siteResolver: new MemorySiteResolver([
    { siteKey: 'site_ok', site: { siteId: '1', tenantId: 't1', allowedDomains: ['example.com'], status: 'active' } },
  ]),
  sessionStore: new MemorySessionStore(),
})

app.post('/v1/session', async (c) => {
  try {
    const siteKey = c.req.header(SITE_KEY_HEADER) || ''
    const body = await c.req.json()
    const result = await detector.createSession({
      siteKey,
      ...body,
      request: { ip: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') },
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return c.json(err.toJSON(), 400)
    return c.json({ error: 'Internal error' }, 500)
  }
})

app.post('/v1/analyze', async (c) => {
  try {
    const siteKey = c.req.header(SITE_KEY_HEADER) || ''
    const body = await c.req.json()
    const result = await detector.analyze({
      siteKey,
      ...body,
      request: { ip: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') },
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof BotDetectorError) return c.json(err.toJSON(), 400)
    return c.json({ error: 'Internal error' }, 500)
  }
})

export default app
```

---

### 4. NestJS

#### Step 1: Create `bot-detector.guard.ts`

```ts
// src/bot-detector/bot-detector.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BotDetectionServer } from '@devn/bot-detector-server'

export const RISK_ACTION_KEY = 'riskAction'
export const RequireRiskAction = (action: string) => SetMetadata(RISK_ACTION_KEY, action)

@Injectable()
export class BotDetectorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly server: BotDetectionServer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expectedAction = this.reflector.get<string>(RISK_ACTION_KEY, context.getHandler())
    const req = context.switchToHttp().getRequest()
    const token = req.headers['x-risk-token'] || req.body?.riskToken

    if (!token) throw new ForbiddenException('Missing risk verification token')

    try {
      const payload = await this.server.consumeRiskToken(token, {
        expectedAction,
      })

      if (payload.decision === 'block') {
        throw new ForbiddenException('Blocked by risk policy')
      }

      req.riskToken = payload
      return true
    } catch (err: any) {
      throw new ForbiddenException(err.message || 'Invalid risk token')
    }
  }
}
```

#### Step 2: Decorate NestJS Controller:

```ts
// src/auth/auth.controller.ts
import { Controller, Post, UseGuards, Body } from '@nestjs/common'
import { BotDetectorGuard, RequireRiskAction } from '../bot-detector/bot-detector.guard'

@Controller('auth')
export class AuthController {
  @Post('login')
  @UseGuards(BotDetectorGuard)
  @RequireRiskAction('login')
  async login(@Body() credentials: LoginDto) {
    return { success: true }
  }
}
```

---

### 5. AdonisJS

```ts
// app/controllers/risk_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import { BotDetectionServer, BotDetectorError, MemorySessionStore, MemorySiteResolver, SITE_KEY_HEADER } from '@devn/bot-detector-server'

const server = new BotDetectionServer({
  secret: process.env.BOT_DETECTOR_SECRET!,
  siteResolver: new MemorySiteResolver([
    { siteKey: 'site_ok', site: { siteId: '1', tenantId: 't1', allowedDomains: ['example.com'], status: 'active' } },
  ]),
  sessionStore: new MemorySessionStore(),
})

export default class RiskController {
  async session({ request, response }: HttpContext) {
    try {
      const siteKey = String(request.header(SITE_KEY_HEADER) || '')
      const result = await server.createSession({
        siteKey,
        ...request.body(),
        request: { ip: request.ip(), userAgent: request.header('user-agent') },
      })
      return response.json(result)
    } catch (err) {
      if (err instanceof BotDetectorError) return response.status(400).json(err.toJSON())
      return response.status(500).json({ error: 'Internal Error' })
    }
  }

  async analyze({ request, response }: HttpContext) {
    try {
      const siteKey = String(request.header(SITE_KEY_HEADER) || '')
      const result = await server.analyze({
        siteKey,
        ...request.body(),
        request: { ip: request.ip(), userAgent: request.header('user-agent') },
      })
      return response.json(result)
    } catch (err) {
      if (err instanceof BotDetectorError) return response.status(400).json(err.toJSON())
      return response.status(500).json({ error: 'Internal Error' })
    }
  }
}
```

---

## Protecting Sensitive Endpoints (HMAC Risk Tokens)

The returned HMAC-SHA256 risk token (`result.riskToken`) is mathematically bound to:
1. `requestId`
2. `siteId`
3. `sessionId`
4. `decision` ('allow' | 'monitor' | 'challenge' | 'block')
5. `action` (e.g. 'login', 'checkout')
6. `issuedAt` & `expiresAt` timestamps

### Recommended Backend Gating Checklist:

1. **Always use `consumeRiskToken` for irreversible operations** (payments, signups, password resets) so tokens cannot be reused.
2. **Always enforce `expectedAction`** so a token acquired on a non-sensitive page cannot be submitted to `/api/admin/transfer`.
3. **Set short `maxAgeMs`** (e.g. 60–120 seconds) for sensitive actions so tokens cannot be banked and spent later.
4. **Use `trustProxy: true`** only when behind a reliable reverse proxy (NGINX, Cloudflare, ALB) to prevent IP header spoofing.
