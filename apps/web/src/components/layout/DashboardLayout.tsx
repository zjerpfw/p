// apps/web/src/components/layout/DashboardLayout.tsx
import { BellRing, BriefcaseBusiness, ChevronRight, History, LayoutDashboard, LogOut, MapPinned, Settings, ShieldCheck, UserRound, UsersRound, WalletCards } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clearAccessToken, getCurrentUserRole } from '@/lib/api'
import { useIsMobile } from '@/hooks/useIsMobile'
import { CommandPalette } from './CommandPalette'

const navigation = [
  { to: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/customers', label: '客户池', icon: UsersRound },
  { to: '/won-customers', label: '成交客户', icon: MapPinned },
  { to: '/deals', label: '商机看板', icon: BriefcaseBusiness },
  { to: '/my-work', label: '我的工作', icon: BriefcaseBusiness },
  { to: '/finance', label: '财务台账', icon: WalletCards },
  { to: '/users', label: '员工管理', icon: ShieldCheck, adminOnly: true },
  { to: '/audit-logs', label: '操作日志', icon: History, adminOnly: true },
  { to: '/notifications', label: '通知记录', icon: BellRing, adminOnly: true },
  { to: '/settings', label: '系统设置', icon: Settings, adminOnly: true },
]

function DesktopNavigation() {
  const isAdmin = getCurrentUserRole() === 'admin'
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isAdmin)
  return (
    <nav className="space-y-1">
      {visibleNavigation.map(({ icon: Icon, label, to }) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              'flex items-center justify-start gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
            )
          }
          key={to}
          to={to}
        >
          <Icon aria-hidden="true" className="size-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

const mobileNavigation = [
  { to: '/deals', label: '看板', icon: BriefcaseBusiness },
  { to: '/won-customers', label: '成交', icon: MapPinned },
  { to: '/my-work', label: '我的', icon: UserRound },
]

function MobileTabBar() {
  return <nav className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
    {mobileNavigation.map(({ icon: Icon, label, to }) => <NavLink className={({ isActive }) => cn('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', isActive ? 'text-indigo-600' : 'text-slate-500')} key={to} to={to}><Icon aria-hidden="true" className="size-5" /><span>{label}</span></NavLink>)}
  </nav>
}

function DesktopShell({ currentLabel, isAdmin, logout }: { currentLabel: string; isAdmin: boolean; logout: () => void }) {
  const navigate = useNavigate()
  return <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-slate-50 text-foreground">
    <aside className="flex min-h-screen flex-col bg-slate-950 p-4 text-slate-100">
      <div className="mb-9 flex items-center gap-3 px-2 pt-2 text-base font-semibold"><span className="grid size-9 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">C</span><div><p>CRM 智能工作台</p><p className="mt-0.5 text-xs font-normal text-slate-400">SaaS 销售运营</p></div></div>
      <DesktopNavigation />
      <button className="mt-auto flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" onClick={logout} type="button"><LogOut aria-hidden="true" className="size-5" />退出登录</button>
    </aside>
    <div className="min-w-0">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8"><div className="flex min-w-0 items-center gap-2 text-sm"><span className="font-medium text-slate-500">CRM 智能工作台</span><ChevronRight aria-hidden="true" className="size-4 text-slate-300" /><span className="truncate font-semibold text-slate-800">{currentLabel}</span></div><div className="flex items-center gap-2"><CommandPalette onCreateCustomer={() => navigate('/customers?create=1')} onCreateDeal={() => navigate('/deals?create=1')} /><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="grid size-7 place-items-center rounded-md bg-indigo-100 text-indigo-700"><UserRound aria-hidden="true" className="size-4" /></span><div className="leading-tight"><p className="text-xs font-semibold text-slate-800">当前登录用户</p><p className="mt-0.5 text-[11px] text-slate-500">{isAdmin ? '系统管理员' : '销售顾问'}</p></div></div></div></header>
      <main className="mx-auto w-full max-w-[1440px] p-8"><Outlet /></main>
    </div>
  </div>
}

function MobileShell({ currentLabel, logout }: { currentLabel: string; logout: () => void }) {
  return <div className="min-h-dvh bg-slate-50 text-foreground">
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur"><h1 className="truncate text-base font-semibold text-slate-900">{currentLabel}</h1><Button aria-label="退出登录" onClick={logout} size="icon-sm" type="button" variant="ghost"><LogOut aria-hidden="true" /></Button></header>
    <main className="w-full px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"><Outlet /></main>
    <MobileTabBar />
  </div>
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const isAdmin = getCurrentUserRole() === 'admin'
  const currentNavigation = navigation.find((item) => location.pathname === item.to)
  const currentLabel = location.pathname.startsWith('/customers/') ? '客户详情' : currentNavigation?.label ?? '客户关系管理'

  function logout() {
    clearAccessToken()
    navigate('/login', { replace: true })
  }

  return isMobile ? <MobileShell currentLabel={currentLabel} logout={logout} /> : <DesktopShell currentLabel={currentLabel} isAdmin={isAdmin} logout={logout} />
}
