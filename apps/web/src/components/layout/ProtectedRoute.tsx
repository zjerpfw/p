// apps/web/src/components/layout/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAccessToken } from '@/lib/api'

export default function ProtectedRoute() {
  const location = useLocation()

  if (!getAccessToken()) {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  return <Outlet />
}
