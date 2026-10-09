/** A load that failed, with a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-destructive">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-border px-4 py-2 hover:bg-muted"
      >
        Reintentar
      </button>
    </div>
  )
}
