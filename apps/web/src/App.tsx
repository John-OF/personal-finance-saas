import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AppLayout, GuestLayout, GuestOnly } from './app/layouts'
import { SessionProvider } from './app/SessionProvider'
import { AuthCard } from './components/ui/form'
import { ConfirmEmailPage } from './features/auth/ConfirmEmailPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { SignupPage } from './features/auth/SignupPage'
import { HomePage } from './features/home/HomePage'
import { SettingsPage } from './features/settings/SettingsPage'

// The Worker serves index.html for every path outside /api, so these routes work on reload.
// /auth/confirm and /auth/reset-password are the targets of the links in Supabase's emails
// (templates in supabase/email-templates).
export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route element={<GuestLayout />}>
            <Route
              path="login"
              element={
                <GuestOnly>
                  <LoginPage />
                </GuestOnly>
              }
            />
            <Route
              path="signup"
              element={
                <GuestOnly>
                  <SignupPage />
                </GuestOnly>
              }
            />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="auth/confirm" element={<ConfirmEmailPage />} />
            <Route path="auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}

function NotFound() {
  return (
    <AuthCard title="Página no encontrada">
      <Link to="/" className="text-sm text-link underline">
        Ir al inicio
      </Link>
    </AuthCard>
  )
}
