/**
 * Public Turnstile site key (the secret lives in Supabase Auth). While it is null the forms show no
 * captcha and send no token; set it before enabling the captcha in Supabase, or logins will fail.
 */
export const TURNSTILE_SITE_KEY: string | null = '0x4AAAAAAFP44u_TgdaVaAvp'
