import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AdminOnly, AppLayout, GuestLayout, GuestOnly, ModuleOnly, SignedIn } from './app/layouts'
import { SessionProvider } from './app/SessionProvider'
import { AuthCard } from './components/ui/form'
import { ToastProvider } from './components/ui/toast'
import { AdminPage } from './features/admin/AdminPage'
import { ConfirmEmailPage } from './features/auth/ConfirmEmailPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { SignupPage } from './features/auth/SignupPage'
import { CommissionLayout } from './features/commission/CommissionLayout'
import { HistoryView } from './features/commission/HistoryView'
import { PlanSettings } from './features/commission/PlanSettings'
import { WeekView } from './features/commission/WeekView'
import { AccountsPage } from './features/finances/AccountsPage'
import { CategoriesPage } from './features/finances/CategoriesPage'
import { TransactionsPage } from './features/finances/TransactionsPage'
import { HomePage } from './features/home/HomePage'
import { OnboardingPage } from './features/onboarding/OnboardingPage'
import { SettingsPage } from './features/settings/SettingsPage'

// The Worker serves index.html for every path outside /api, so these routes work on reload.
// /auth/confirm and /auth/reset-password are the targets of the links in Supabase's emails
// (templates in supabase/email-templates).
export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </SessionProvider>
  )
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SignedIn />}>
          <Route path="welcome" element={<OnboardingPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="commission" element={<CommissionLayout />}>
              <Route index element={<WeekView />} />
              <Route path="history" element={<HistoryView />} />
              <Route path="settings" element={<PlanSettings />} />
            </Route>
            <Route
              path="transactions"
              element={
                <ModuleOnly module="finances">
                  <TransactionsPage />
                </ModuleOnly>
              }
            />
            <Route
              path="accounts"
              element={
                <ModuleOnly module="finances">
                  <AccountsPage />
                </ModuleOnly>
              }
            />
            <Route
              path="categories"
              element={
                <ModuleOnly module="finances">
                  <CategoriesPage />
                </ModuleOnly>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="admin"
              element={
                <AdminOnly>
                  <AdminPage />
                </AdminOnly>
              }
            />
          </Route>
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
