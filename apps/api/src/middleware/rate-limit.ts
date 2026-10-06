import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'

/** Limits authentication attempts per client IP (CF-Connecting-IP is set by Cloudflare). */
export function limitAuthByIp(action: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
    const { success } = await c.env.AUTH_RATE_LIMITER.limit({ key: `${action}:${ip}` })
    if (!success) return apiError(c, 429, 'rate_limited', 'Demasiados intentos. Espera un minuto.')
    return next()
  })
}
