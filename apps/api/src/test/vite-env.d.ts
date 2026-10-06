// Vitest (through Vite) implements import.meta.glob; the API itself is typed for Workers, not Vite.
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: '?raw'; import: 'default'; eager: true },
  ): Record<string, T>
}
