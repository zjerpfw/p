// apps/web/src/components/layout/DashboardLayout.tsx
import { BriefcaseBusiness, ChevronRight, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { clearAccessToken, getCurrentUserRole } from '@/lib/api'

const navigation = [
  { to: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/customers', label: '客户池', icon: UsersRound },
  { to: '/deals', label: '商机看板', icon: BriefcaseBusiness },
  { to: '/my-work', label: '我的工作', icon: BriefcaseBusiness },
  { to: '/users', label: '员工管理', icon: ShieldCheck },
  { to: '/settings', label: '系统设置', icon: Settings, adminOnly: true },
]

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const isAdmin = getCurrentUserRole() === 'admin'
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isAdmin)
  return (
    <nav className={cn(mobile ? 'col-span-5 grid grid-flow-col auto-cols-[4.5rem] overflow-x-auto' : 'space-y-1')}>
      {visibleNavigation.map(({ icon: Icon, label, to }) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center gap-2 text-sm font-medium transition-colors',
              mobile ? 'min-h-14 flex-col gap-0.5 text-xs' : 'rounded-md px-3 py-2.5 justify-start',
              isActive
                ? mobile ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white shadow-sm'
                : mobile ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
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

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = getCurrentUserRole() === 'admin'
  const currentNavigation = navigation.find((item) => location.pathname === item.to)
  const currentLabel = location.pathname.startsWith('/customers/') ? '客户详情' : currentNavigation?.label ?? '客户关系管理'

  function logout() {
    clearAccessToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-foreground md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen bg-slate-950 p-4 text-slate-100 md:flex md:flex-col">
        <div className="mb-9 flex items-center gap-3 px-2 pt-2 text-base font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">C</span>
          <div><p>CRM 智能工作台</p><p className="mt-0.5 text-xs font-normal text-slate-400">SaaS 销售运营</p></div>
        </div>
        <Navigation />
        <button className="mt-auto flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" onClick={logout} type="button"><LogOut aria-hidden="true" className="size-5" />退出登录</button>
      </aside>

      <div className="min-w-0 pb-16 md:pb-0">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden font-medium text-slate-500 sm:inline">CRM 智能工作台</span>
            <ChevronRight aria-hidden="true" className="hidden size-4 text-slate-300 sm:inline" />
            <span className="truncate font-semibold text-slate-800">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <span className="grid size-7 place-items-center rounded-md bg-indigo-100 text-indigo-700"><UserRound aria-hidden="true" className="size-4" /></span>
            <div className="hidden leading-tight sm:block"><p className="text-xs font-semibold text-slate-800">当前登录用户</p><p className="mt-0.5 text-[11px] text-slate-500">{isAdmin ? '系统管理员' : '销售顾问'}</p></div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-5 md:p-8">
          <Outlet />
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background md:hidden">
        <div className="grid grid-cols-6"><Navigation mobile /><button className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground" onClick={logout} type="button"><LogOut aria-hidden="true" className="size-5" /><span>退出登录</span></button></div>
      </div>
    </div>
  )
}
