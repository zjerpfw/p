// apps/web/src/components/layout/AdminRoute.tsx
import { Navigate, Outlet } from 'react-router-dom'
import { getCurrentUserRole } from '@/lib/api'

export default function AdminRoute() {
  return getCurrentUserRole() === 'admin' ? <Outlet /> : <Navigate replace to="/dashboard" />
}
