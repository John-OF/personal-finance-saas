import type { ModuleId } from '@pf/shared'
import {
  ArrowLeftRight,
  HandCoins,
  House,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Only active on the exact path (the home page would match everything otherwise). */
  end?: boolean
  /** Only shown to admins. */
  adminOnly?: boolean
  /** Only shown when the user enabled this module. */
  module?: ModuleId
}

// Modules join this list as they are built.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/transactions', label: 'Movimientos', icon: ArrowLeftRight, module: 'finances' },
  { to: '/commission', label: 'Comisión', icon: HandCoins, module: 'commission' },
  { to: '/admin', label: 'Administración', icon: ShieldCheck, adminOnly: true },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]
