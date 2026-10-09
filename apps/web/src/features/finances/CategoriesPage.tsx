import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryInputSchema,
  formErrors,
  type Category,
  type CategoryKind,
} from '@pf/shared'
import { useCallback, useState, type FormEvent } from 'react'
import { FormAlert } from '../../components/ui/form'
import { LoadError } from '../../components/ui/load-error'
import { useToast } from '../../components/ui/toast-context'
import { useLoad } from '../../lib/use-load'
import { describeFailure } from '../auth/submit'
import { financeApi } from './api'
import { CATEGORY_KIND_LABELS } from './labels'

/** Expenses first: they are recorded far more often. */
const KIND_ORDER: CategoryKind[] = ['expense', 'income']

const tabClass =
  'flex h-10 items-center justify-center rounded-md text-sm font-semibold text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background'
const inputClass = 'h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base'
const smallButton = 'h-9 rounded-lg px-2.5 text-sm font-semibold hover:bg-muted'

/** /categories: income and expense categories (plan §6.2). */
export function CategoriesPage() {
  const load = useCallback(() => financeApi.categories(), [])
  const { data, error, reload } = useLoad(load)
  const [kind, setKind] = useState<CategoryKind>('expense')

  if (error) return <LoadError message={error} onRetry={reload} />
  if (!data) return <p className="text-muted-foreground">Cargando…</p>

  const ofKind = data.categories.filter((c) => c.kind === kind)
  const open = ofKind.filter(({ archived }) => !archived)
  const archived = ofKind.filter((c) => c.archived)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl">Categorías</h2>
      <div
        role="group"
        aria-label="Tipo de categoría"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1"
      >
        {KIND_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={tabClass}
          >
            {CATEGORY_KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <AddCategory key={kind} kind={kind} onAdded={reload} />

      <ul className="overflow-hidden rounded-2xl border border-border bg-card">
        {open.map((category) => (
          <CategoryRow key={category.id} category={category} onChanged={reload} />
        ))}
        {open.length === 0 && (
          <li className="px-4 py-3 text-muted-foreground">No tienes categorías de este tipo.</li>
        )}
      </ul>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="mt-2 text-lg font-bold">Archivadas</h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card opacity-80">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category} onChanged={reload} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Archivar una categoría la quita del alta rápida sin tocar sus movimientos. Solo se puede
        borrar una categoría sin movimientos.
      </p>
    </div>
  )
}

function AddCategory({ kind, onAdded }: { kind: CategoryKind; onAdded: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = { kind, name: name.trim() }
    const invalid = formErrors(categoryInputSchema, input)
    if (invalid) {
      setError(Object.values(invalid).flat()[0] ?? 'Revisa el nombre.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await financeApi.createCategory(input)
      setName('')
      onAdded()
      toast(`Categoría creada: ${input.name}`)
    } catch (err) {
      setError(describeFailure(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Nombre de la nueva categoría"
          placeholder={kind === 'expense' ? 'Nueva: Mascotas, Ropa…' : 'Nueva: Arriendos, Bonos…'}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Añadir
        </button>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
    </form>
  )
}

function CategoryRow({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(category.name)
  const [error, setError] = useState<string | null>(null)

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === category.name) {
      setRenaming(false)
      return
    }
    const invalid = formErrors(categoryInputSchema, { kind: category.kind, name: trimmed })
    if (invalid) {
      setError(Object.values(invalid).flat()[0] ?? 'Revisa el nombre.')
      return
    }
    try {
      await financeApi.updateCategory(category.id, { name: trimmed })
      setRenaming(false)
      onChanged()
    } catch (err) {
      setError(describeFailure(err).message)
    }
  }

  async function setArchived(value: boolean) {
    try {
      await financeApi.updateCategory(category.id, { archived: value })
      onChanged()
      toast(value ? `Archivada: ${category.name}` : `Reactivada: ${category.name}`, {
        action: {
          label: 'Deshacer',
          run: () => {
            financeApi
              .updateCategory(category.id, { archived: !value })
              .then(onChanged, () => toast('No se pudo deshacer.'))
          },
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  async function remove() {
    try {
      await financeApi.deleteCategory(category.id)
      onChanged()
      toast(`Borrada: ${category.name}`, {
        action: {
          label: 'Deshacer',
          run: () => {
            financeApi
              .createCategory({ kind: category.kind, name: category.name })
              .then(onChanged, () => toast('No se pudo deshacer.'))
          },
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  return (
    <li className="border-t border-border px-4 py-2 first:border-t-0">
      {renaming ? (
        <form noValidate onSubmit={(event) => void rename(event)} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label={`Nuevo nombre de ${category.name}`}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              autoComplete="off"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              className={inputClass}
            />
            <button type="submit" className={`${smallButton} border border-border`}>
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false)
                setName(category.name)
                setError(null)
              }}
              className={smallButton}
            >
              Cancelar
            </button>
          </div>
          {error && <FormAlert>{error}</FormAlert>}
        </form>
      ) : (
        // On a phone the actions go on a second line, so long names are not cut short.
        <div className="flex flex-wrap items-center gap-x-1">
          <span className="min-w-0 basis-full py-1 sm:flex-1 sm:basis-0">
            <span className="block truncate">{category.name}</span>
            {category.recentUseCount > 0 && (
              <span className="block text-sm text-muted-foreground">
                {category.recentUseCount === 1
                  ? '1 uso en 90 días'
                  : `${category.recentUseCount} usos en 90 días`}
              </span>
            )}
          </span>
          <div className="-ml-2.5 flex sm:ml-0">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className={`${smallButton} text-link`}
            >
              Renombrar
            </button>
            <button
              type="button"
              onClick={() => void setArchived(!category.archived)}
              className={smallButton}
            >
              {category.archived ? 'Reactivar' : 'Archivar'}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              aria-label={`Borrar ${category.name}`}
              className={`${smallButton} text-destructive`}
            >
              Borrar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
