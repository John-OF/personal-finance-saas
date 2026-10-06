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
pnpm --filter @pf/api db:migrate app_dev
pnpm dev
```

`db:credentials` asigna contraseñas nuevas a los roles de la API (`pf_api` para producción y `pf_api_dev`
para local), actualiza Hyperdrive y escribe la conexión local en `apps/api/.env`. Solo hace falta la primera
vez o para rotar las contraseñas. El SQL que crea los schemas y los roles está en
`apps/api/scripts/bootstrap-db.sql`.

- Web con recarga en caliente: <http://localhost:5173> (redirige `/api` al Worker)
- Worker (web compilada + API): <http://localhost:8787>

## Base de datos

Las tablas se declaran en `apps/api/src/db/schema.ts`, sin schema: el rol de la conexión decide si los
datos van a `app` (producción) o a `app_dev` (local). Toda tabla de usuario tiene RLS y la API fija el
usuario en cada transacción.

| Comando                                                | Qué hace                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm --filter @pf/api db:generate`                    | Genera la migración SQL en `apps/api/drizzle/` (revísala)                         |
| `pnpm --filter @pf/api db:migrate app_dev`             | Aplica las migraciones pendientes en el schema de desarrollo                      |
| `pnpm --filter @pf/api db:credentials`                 | Asigna o rota las contraseñas de los roles de la API                              |
| `pnpm --filter @pf/api admin:promote app_dev <correo>` | Hace administrador a un usuario registrado (en `app`, con `--confirm-production`) |

Producción (`app`) la migra el CI antes de cada despliegue. Las migraciones se aplican todas en una
transacción y se registran con un hash: una migración ya aplicada no se edita, se añade otra.

## Scripts

| Comando           | Qué hace                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`        | Vite y `wrangler dev` en paralelo                                                  |
| `pnpm check`      | Tipos, lint, formato, pruebas y build (lo mismo que CI)                            |
| `pnpm test`       | Pruebas de todos los paquetes                                                      |
| `pnpm format`     | Formatea con Prettier                                                              |
| `pnpm run deploy` | Compila la web y despliega el Worker (`run` evita el `pnpm deploy` propio de pnpm) |
