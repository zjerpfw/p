// apps/web/src/components/layout/DashboardLayout.tsx
import { BriefcaseBusiness, LayoutDashboard, Settings, UsersRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navigation = [
  { to: '/customers', label: '客户池', icon: UsersRound },
  { to: '/deals', label: '商机看板', icon: LayoutDashboard },
  { to: '/my-work', label: '我的工作', icon: BriefcaseBusiness },
  { to: '/settings', label: '系统设置', icon: Settings },
]

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={cn(mobile ? 'grid grid-cols-4' : 'space-y-1')}>
      {navigation.map(({ icon: Icon, label, to }) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center gap-2 text-sm font-medium transition-colors',
              mobile ? 'min-h-14 flex-col gap-0.5 text-xs' : 'rounded-md px-3 py-2.5 justify-start',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
  return (
    <div className="min-h-screen bg-stone-100 text-foreground md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-background p-4 md:block">
        <div className="mb-8 flex items-center gap-2 px-2 text-base font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs text-primary-foreground">C</span>
          CRM 工作台
        </div>
        <Navigation />
      </aside>

      <div className="min-w-0 pb-16 md:pb-0">
        <header className="flex h-14 items-center border-b border-border bg-background px-5 md:hidden">
          <span className="text-sm font-semibold">CRM 工作台</span>
        </header>
        <main className="mx-auto w-full max-w-7xl p-5 md:p-8">
          <Outlet />
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background md:hidden">
        <Navigation mobile />
      </div>
    </div>
  )
}
