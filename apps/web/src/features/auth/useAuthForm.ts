import { formErrors } from '@pf/shared'
import { useState } from 'react'
import { describeFailure, type FieldErrors } from './submit'
import { captchaRequired } from './Turnstile'

type Schema = Parameters<typeof formErrors>[0]

/**
 * Shared state of the auth forms: validates with the same schema as the API, adds the captcha
 * token, sends, and shows the API's errors. Every attempt spends the captcha token, so the widget
 * is remounted (new `captcha.key`) afterwards.
 */
export function useAuthForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function submit<T>(
    schema: Schema,
    input: Record<string, unknown>,
    send: (body: Record<string, unknown>) => Promise<T>,
    extraErrors: FieldErrors = {},
  ): Promise<T | undefined> {
    const body = captchaToken ? { ...input, captchaToken } : input
    const invalid = { ...formErrors(schema, body), ...extraErrors }
    if (Object.keys(invalid).length > 0) {
      setFields(invalid)
      setError(null)
      return undefined
    }

    setBusy(true)
    setError(null)
    setFields({})
    try {
      return await send(body)
    } catch (err) {
      const failure = describeFailure(err)
      setError(failure.message)
      setFields(failure.fields)
      return undefined
    } finally {
      setBusy(false)
      if (captchaRequired) {
        setCaptchaToken(null)
        setCaptchaKey((key) => key + 1)
      }
    }
  }

  return {
    busy,
    error,
    fields,
    submit,
    captcha: {
      key: captchaKey,
      onToken: setCaptchaToken,
      ready: !captchaRequired || captchaToken !== null,
    },
  }
}
