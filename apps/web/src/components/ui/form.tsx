import type { InputHTMLAttributes, ReactNode } from 'react'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded border border-line bg-card p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  name: string
  errors?: string[] | undefined
}

/** Labelled input that shows its validation messages and links them for screen readers. */
export function TextField({ label, name, errors, ...input }: TextFieldProps) {
  const errorId = `${name}-error`
  const invalid = Boolean(errors?.length)
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name={name}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        className="rounded border border-line bg-white px-3 py-2 text-base aria-invalid:border-danger"
        {...input}
      />
      {invalid && (
        <span id={errorId} className="text-danger">
          {errors?.[0]}
        </span>
      )}
    </label>
  )
}

export function SubmitButton({
  busy,
  disabled,
  children,
  busyLabel,
}: {
  busy: boolean
  disabled?: boolean
  children: ReactNode
  busyLabel: string
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="rounded bg-ink px-4 py-2 text-paper hover:bg-brand disabled:opacity-50"
    >
      {busy ? busyLabel : children}
    </button>
  )
}

export function FormAlert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'info'
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={tone === 'error' ? 'text-sm text-danger' : 'text-sm text-brand'}
    >
      {children}
    </p>
  )
}
