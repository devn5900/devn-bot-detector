import { NextResponse } from 'next/server'
import { BotDetectorError, SITE_KEY_HEADER } from 'devn-bot-detector-server'
import { serverDetector } from '../../../lib/bot-detector'

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
