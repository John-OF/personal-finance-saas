import { describe, expect, it } from 'vitest'
import { signupInputSchema } from './contracts'
import { formErrors } from './validation'

describe('formErrors', () => {
  it('returns null for valid input', () => {
    expect(
      formErrors(signupInputSchema, { email: 'ana@example.com', password: 'una-clave-larga' }),
    ).toBeNull()
  })

  it('returns the Spanish messages per field', () => {
    expect(formErrors(signupInputSchema, { email: 'ana', password: 'corta' })).toEqual({
      email: ['Escribe un correo válido.'],
      password: ['Usa al menos 10 caracteres.'],
    })
  })
})
