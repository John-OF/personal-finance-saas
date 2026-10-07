import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { SessionProvider } from './app/SessionProvider'
import { GuestOnly, RequireSession, Shell } from './app/Shell'
import { AuthCard } from './components/ui/form'
import { ConfirmEmailPage } from './features/auth/ConfirmEmailPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { SignupPage } from './features/auth/SignupPage'
import { HomePage } from './features/home/HomePage'

// The Worker serves index.html for every path outside /api, so these routes work on reload.
// /auth/confirm and /auth/reset-password are the targets of the links in Supabase's emails
// (templates in supabase/email-templates).
export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route
              index
              element={
                <RequireSession>
                  <HomePage />
                </RequireSession>
              }
            />
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
      <Link to="/" className="text-sm text-brand underline">
        Ir al inicio
      </Link>
    </AuthCard>
  )
}
