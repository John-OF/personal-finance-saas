import { House, Settings, ShieldCheck, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Only active on the exact path (the home page would match everything otherwise). */
  end?: boolean
  /** Only shown to admins. */
  adminOnly?: boolean
}

// Modules (movimientos, comisión, deudas…) join this list as they are built, filtered by the
// modules the user enabled.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/admin', label: 'Administración', icon: ShieldCheck, adminOnly: true },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]
