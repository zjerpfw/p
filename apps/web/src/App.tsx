// apps/web/src/App.tsx
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import AdminRoute from './components/layout/AdminRoute'
import ProtectedRoute from './components/layout/ProtectedRoute'

const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DealsPage = lazy(() => import('./pages/DealsPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const MyWorkPage = lazy(() => import('./pages/MyWorkPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

function PageLoader() {
  return <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">正在加载页面...</div>
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<Navigate replace to="/dashboard" />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/my-work" element={<MyWorkPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route element={<AdminRoute />}><Route path="/settings" element={<SettingsPage />} /><Route path="/users" element={<UsersPage />} /><Route path="/audit-logs" element={<AuditLogsPage />} /></Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  )
}
