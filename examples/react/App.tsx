import { useEffect, useRef, useState } from 'react'
import { BotDetector, type RiskResult } from 'devn-bot-detector-client'

export function RiskForm() {
  const detectorRef = useRef<BotDetector | null>(null)
  const [result, setResult] = useState<RiskResult | null>(null)

  useEffect(() => {
    const detector = new BotDetector({
      siteKey: 'site_ok',
      endpoint: 'http://localhost:8787',
      autoStart: false,
      failOpen: true,
    })
    detectorRef.current = detector
    void detector.start()
    return () => detector.destroy()
  }, [])

  async function onSubmit() {
    const risk = await detectorRef.current!.check()
    setResult(risk)
    if (risk.decision === 'block') return
    // continue
  }

  return (
    <div>
      <h1>React example</h1>
      <button type="button" onClick={() => void onSubmit()}>
        Submit with risk check
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
