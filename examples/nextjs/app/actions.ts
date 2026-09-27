'use server'

import { serverDetector } from '../lib/bot-detector'

export interface LoginResult {
  success: boolean
  message: string
}

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') || '')
  const password = String(formData.get('password') || '')
  const riskToken = String(formData.get('riskToken') || '')

  if (!email || !password) {
    return { success: false, message: 'Missing credentials' }
  }

  try {
    // Consume one-time risk token with action scope verification!
    // Protects against automated brute-force attacks and token replay.
    const tokenPayload = await serverDetector.consumeRiskToken(riskToken, {
      expectedAction: 'login',
      maxAgeMs: 2 * 60 * 1000, // Token must be used within 2 minutes
    })

    if (tokenPayload.decision === 'block') {
      return { success: false, message: 'Login blocked due to high automated risk score.' }
    }

    if (tokenPayload.decision === 'challenge') {
      // Prompt MFA / step-up challenge
      return { success: false, message: 'MFA challenge required.' }
    }

    // Proceed with authentication logic (e.g. database query, bcrypt compare)
    return { success: true, message: `Welcome back, ${email}!` }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Verification failed. Please refresh and try again.',
    }
  }
}
