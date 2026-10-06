# personal-finance-saas

Aplicación web para gestionar finanzas personales: ingresos con cualquier frecuencia, gastos, deudas,
préstamos, ahorro, metas, planificación e ingresos por comisión. Multiusuario, con panel de administración.

## Stack

- **Web:** React + Vite + Tailwind CSS (`apps/web`)
- **API:** Hono sobre Cloudflare Workers, que también sirve la web (`apps/api`)
- **Base de datos y autenticación:** Supabase (Postgres + Auth)
- **Compartido:** esquemas, tipos y lógica de dominio (`packages/shared`)

## Requisitos

- Node 22 o superior
- pnpm 12 (`npm install -g pnpm`)

## Puesta en marcha

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter @pf/api db:credentials   # pide la contraseña de postgres; escribe apps/api/.env
pnpm dev
```

`db:credentials` asigna contraseñas nuevas a los roles de la API (`pf_api` para producción y `pf_api_dev`
para local), actualiza Hyperdrive y escribe la conexión local en `apps/api/.env`. Solo hace falta la primera
vez o para rotar las contraseñas. El SQL que crea los schemas y los roles está en
`apps/api/scripts/bootstrap-db.sql`.

- Web con recarga en caliente: <http://localhost:5173> (redirige `/api` al Worker)
- Worker (web compilada + API): <http://localhost:8787>

## Scripts

| Comando       | Qué hace                                                |
| ------------- | ------------------------------------------------------- |
| `pnpm dev`    | Vite y `wrangler dev` en paralelo                       |
| `pnpm check`  | Tipos, lint, formato, pruebas y build (lo mismo que CI) |
| `pnpm test`   | Pruebas de todos los paquetes                           |
| `pnpm format` | Formatea con Prettier                                   |
| `pnpm deploy` | Compila la web y despliega el Worker                    |
