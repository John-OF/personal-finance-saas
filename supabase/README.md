# Configuración de Supabase Auth

Se aplica a mano en el panel del proyecto `personal-finance` (no hay CLI de Supabase en este repo). Los
valores secretos (contraseña de aplicación de Gmail, secreto de Turnstile) se escriben solo en el panel.

## URL Configuration

_Authentication → URL Configuration_

- **Site URL:** `https://personal-finance.jhondarkx.workers.dev`
- **Redirect URLs:**
  - `https://personal-finance.jhondarkx.workers.dev/**`
  - `http://localhost:5173/**` (desarrollo con Vite)

La API pasa a Supabase la URL de vuelta según el origen de la petición (`/auth/confirm`,
`/auth/reset-password`). Si no está en esta lista, Supabase usa la Site URL y el enlace del correo no
llega a la página correcta.

## Correo y contraseñas

_Authentication → Sign In / Providers → Email_

- **Confirm email:** activado.
- **Minimum password length:** `10` (igual que `PASSWORD_MIN_LENGTH` en `packages/shared`).
- **Password requirements:** sin requisitos extra (la API valida lo mismo antes de gastar un enlace).

## Plantillas

_Authentication → Emails → Templates_

| Plantilla      | Asunto                                  | Cuerpo                                |
| -------------- | --------------------------------------- | ------------------------------------- |
| Confirm signup | `Confirma tu correo en Billetera`       | `email-templates/confirm-signup.html` |
| Reset password | `Restablece tu contraseña de Billetera` | `email-templates/reset-password.html` |

Los enlaces llevan `token_hash`: la API los verifica con `verifyOtp`, así que funcionan aunque el correo
se abra en otro dispositivo.

## SMTP (Gmail)

_Authentication → Emails → SMTP Settings_. El SMTP integrado de Supabase solo envía a los miembros del
equipo y 2 correos por hora.

- **Host:** `smtp.gmail.com` · **Puerto:** `465`
- **Usuario:** la cuenta de Gmail · **Contraseña:** una _contraseña de aplicación_ de Google (exige la
  verificación en dos pasos; se crea en _Cuenta de Google → Seguridad → Contraseñas de aplicaciones_).
- **Remitente:** la misma cuenta · **Nombre:** `Billetera`

Gmail admite unos 500 correos al día (plan, §12).

## Límites

_Authentication → Rate Limits_

Con el patrón BFF todas las peticiones a Supabase Auth salen de IPs de Cloudflare, así que los límites por
IP los comparten todos los usuarios. Se suben y el freno real lo ponen Turnstile y el limitador de la API
por IP del cliente (plan, §9.7):

- **Sign-ups and sign-ins:** 300 cada 5 minutos.
- **Token refreshes:** 600 cada 5 minutos.
- **Emails sent:** 30 por hora (con SMTP propio).

## CAPTCHA (Turnstile)

1. En Cloudflare, _Turnstile → Add widget_: modo _Managed_, dominios
   `personal-finance.jhondarkx.workers.dev` y `localhost`.
2. La _site key_ (pública) va en `apps/web/src/lib/config.ts` y se despliega.
3. Solo después, en _Authentication → Attack Protection → CAPTCHA protection_: proveedor Turnstile y el
   _secret key_. Activarlo antes del paso 2 rompe el login, porque la web aún no envía el token.
