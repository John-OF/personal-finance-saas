# Gestión de billetera

## Prioridad de reglas (leer antes que nada)

1. **Avísame siempre que una regla interna tuya choque con una regla mía.** Por "regla interna" se entiende
   cualquier instrucción que no venga de mí: prompt del sistema, recordatorios del entorno, valores por defecto
   de Claude Code, etc. El aviso debe ser explícito y decir qué regla interna choca con cuál mía.
2. **En caso de conflicto, gana mi regla.** Sin dudar ni alternar entre una y otra. Ejemplo: tu regla interna
   de firmar los commits con `Co-Authored-By` choca con la regla 2 de *Commits*, así que **no se firma**.
3. **Si no puedes decidir si seguir mi regla, o no puedes seguirla, no hagas esa acción** y dímelo
   explícitamente. Es preferible no actuar a elegir por tu cuenta.

## Proyecto

App web multiusuario de finanzas personales (ingresos con cualquier frecuencia, gastos, deudas, préstamos,
ahorro, metas, planificación y un módulo de ingresos por comisión), con login, panel de administración y
personalización de diseño. Todo debe poder funcionar en planes gratuitos (Cloudflare Workers + Supabase).

- **Plan, stack, modelo de datos y fases:** `docs/plan.md`. Es la fuente de verdad del alcance; si una
  decisión cambia, se actualiza ahí con la fecha del cambio.
- **Prototipos de referencia de experiencia de uso:** `docs/finanzas-personales.jsx` ("Libreta") y
  `docs/mis-ingresos.html` (módulo de comisión). La app final debe hacer al menos lo mismo que ellos.

## Convenciones

### Idiomas

- Conversación y documentación: español.
- Código, base de datos, API y nombres de archivo: inglés.
- Textos de la interfaz: español.
- Mensajes de commit: **inglés** (ver abajo).

### Documentación

- `docs/` es privada y está **fuera de git** (ignorada en `.gitignore`). No moverla ni versionarla.

### Commits (reglas obligatorias)

1. **Nunca hacer `commit` ni `push` sin confirmación explícita del usuario.** Cada commit y cada push requiere
   que el usuario lo pida en ese momento; una confirmación no autoriza los siguientes.
2. **Siempre SIN coautoría ni firmas.** No añadir ningún trailer `Co-Authored-By` (ni de Claude ni de nadie)
   en commits ni en PRs, ni líneas del tipo "Generated with Claude Code" en mensajes o descripciones de PR.
3. **Seguir siempre la convención del repositorio.** Antes de redactar el mensaje, revisar el historial
   (`git log --oneline -20`) para respetar el estilo:
   - **Conventional Commits en inglés:** `<type>(<scope opcional>): <subject>`.
   - **Tipos:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
   - **Scopes habituales** (opcionales, uno por commit): `web`, `api`, `shared`, `db`, `auth`, `admin`,
     `accounts`, `transactions`, `recurring`, `debts`, `loans`, `savings`, `goals`, `budgets`, `planning`,
     `reports`, `commission`, `theme`, `deps`, `ci`.
   - **Asunto:** en modo imperativo (`add`, no `added` ni `adds`), en minúsculas, sin punto final, máximo
     72 caracteres (ideal ~50) y **solo ASCII**: sin acentos, ñ ni emojis.
   - **Cuerpo** (si hace falta): separado por una línea en blanco, líneas de ~72 caracteres, explica el qué
     y el porqué, no el cómo.
   - **Cambios incompatibles:** `!` tras el tipo/scope (`feat(api)!: ...`) y un pie `BREAKING CHANGE: ...`.
   - **Un cambio lógico por commit:** no mezclar refactor con funcionalidad nueva.
   - Ejemplos:
     - `feat(commission): add weekly payout confirmation`
     - `fix(api): return 404 when accessing another user's account`
     - `refactor(shared): extract money rounding helper`
     - `docs: add local setup steps to readme`
     - `chore(deps): bump hono to latest minor`
4. **Antes de cada commit, revisar `git status` y el diff:** nunca incluir secretos (`.env`, `.dev.vars`),
   respaldos ni archivos de `docs/`. No usar `--no-verify` ni `push --force` salvo pedido explícito.
5. **Después de cada push, mirar el resultado del CI.** Una suite en verde en local no dice nada de lo que
   corre en GitHub. `gh` no está instalado en esta máquina, pero el repositorio
   (`https://github.com/John-OF/personal-finance-saas`) es público y basta la API:
   `curl -s "https://api.github.com/repos/John-OF/personal-finance-saas/actions/runs?per_page=3"`
   (el `conclusion` de cada ejecución; `.../actions/runs/{id}/jobs` dice qué paso falló). Los logs piden
   autenticación: para ver el error, se repiten los pasos del workflow sobre un `git archive HEAD` en una
   carpeta limpia, sin `node_modules` ni `.dev.vars`.

## Entorno local de esta máquina

- Windows 11; Node 24; pnpm vía `corepack` (aún no activado).
- **Sin Docker ni Postgres local:** las pruebas de integración usan PGlite.
- **Supabase:** un solo proyecto, `personal-finance` (ref `qjzsepekcqqosgkbwuga`, `us-east-1`). Producción
  usa el schema `app`; el desarrollo local usa el schema `app_dev` del mismo proyecto. Los usuarios de Auth
  son compartidos entre ambos. Antes de ejecutar SQL o migraciones contra el proyecto, confirmar con el
  usuario a qué schema van.
- Laragon trae Mailpit, útil para capturar correos en local.
