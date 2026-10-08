import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../../lib/config'

// Cloudflare Turnstile, the captcha Supabase Auth checks on signup, login (also when the password is
// changed, which signs in again) and password recovery.
// Allowed by the CSP in public/_headers (script-src and frame-src challenges.cloudflare.com).

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      language: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile() {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing'))
    script.onerror = () => {
      loading = null
      reject(new Error('turnstile_load_failed'))
    }
    document.head.append(script)
  })
  return loading
}

/** Whether the forms must wait for a captcha token before submitting. */
export const captchaRequired = TURNSTILE_SITE_KEY !== null

/**
 * Renders the widget and reports its token (null when it expires or fails). Tokens are single use:
 * remount it with a new `key` after each submit attempt.
 */
export function Turnstile({
  action,
  onToken,
}: {
  action: 'login' | 'signup' | 'recover' | 'change_password'
  onToken: (token: string | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const report = useRef(onToken)

  useEffect(() => {
    report.current = onToken
  }, [onToken])

  useEffect(() => {
    const siteKey = TURNSTILE_SITE_KEY
    if (!siteKey) return
    let widgetId: string | undefined
    let cancelled = false
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !container.current) return
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          language: 'es',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        })
      },
      () => report.current(null),
    )
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [action])

  if (!captchaRequired) return null
  return <div ref={container} className="min-h-16" />
}
