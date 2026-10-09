import { createContext, use } from 'react'

export interface ToastOptions {
  /** A button such as "Deshacer"; the toast stays longer when there is one. */
  action?: { label: string; run: () => void }
}

export type ShowToast = (message: string, options?: ToastOptions) => void

export const ToastContext = createContext<ShowToast | null>(null)

/** Shows a short confirmation at the bottom of the screen; only inside ToastProvider. */
export function useToast() {
  const show = use(ToastContext)
  if (!show) throw new Error('useToast must be used inside ToastProvider')
  return show
}
