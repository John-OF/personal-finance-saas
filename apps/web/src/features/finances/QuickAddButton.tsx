import { Plus } from 'lucide-react'
import { Link } from 'react-router'

/** The always-visible "+" of the quick entry (plan §3.3), above the phone's navigation bar. */
export function QuickAddButton() {
  return (
    <Link
      to="/transactions"
      state={{ quickAdd: true }}
      aria-label="Anotar un movimiento"
      className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 md:bottom-8"
    >
      <Plus aria-hidden className="size-7" />
    </Link>
  )
}
