'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { BotDetector, type RiskResult } from '@devn/bot-detector-client'
import { loginAction } from './actions'

export function useBotDetector() {
  const detectorRef = useRef<BotDetector | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const detector = new BotDetector({
      siteKey: process.env.NEXT_PUBLIC_BOT_SITE_KEY || 'site_demo_key',
      endpoint: '/api/bot',
      autoStart: true,
      failOpen: true,
      onSessionCreated: () => setReady(true),
    })
    detectorRef.current = detector

    return () => {
      detector.destroy()
    }
  }, [])

  return {
    detector: detectorRef.current,
    ready,
    checkAction: (action: string) => detectorRef.current?.checkAction(action),
  }
}

export default function LoginPage() {
  const { checkAction } = useBotDetector()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<string>('')
  const [riskInfo, setRiskInfo] = useState<RiskResult | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    setStatus('Evaluating behavioral signals...')
    // 1. Check client risk for the 'login' action
    const risk = await checkAction('login')
    if (risk) setRiskInfo(risk)

    if (risk?.decision === 'block') {
      setStatus('Action blocked: automated behavior detected.')
      return
    }

    // 2. Attach the cryptographic risk token to the form submission
    if (risk?.riskToken) {
      formData.set('riskToken', risk.riskToken)
    }

    // 3. Submit to server action
    startTransition(async () => {
      const result = await loginAction(formData)
      setStatus(result.message)
    })
  }

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', fontFamily: 'sans-serif', padding: 20 }}>
      <h1>Secure Login (Next.js App Router)</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input name="email" type="email" placeholder="Email address" required defaultValue="user@example.com" />
        <input name="password" type="password" placeholder="Password" required defaultValue="secret123" />
        <button type="submit" disabled={isPending}>
          {isPending ? 'Verifying...' : 'Sign In'}
        </button>
      </form>

      {status && <p style={{ marginTop: 16, fontWeight: 'bold' }}>{status}</p>}

      {riskInfo && (
        <pre style={{ background: '#f4f4f5', padding: 12, borderRadius: 6, fontSize: 13, marginTop: 16 }}>
          {JSON.stringify(riskInfo, null, 2)}
        </pre>
      )}
    </main>
  )
}
