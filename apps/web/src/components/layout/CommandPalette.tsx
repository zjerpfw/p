// apps/web/src/components/layout/CommandPalette.tsx
import { LayoutDashboard, Plus, Search, UsersRound, BriefcaseBusiness } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useCustomers } from '@/hooks/useCustomers'

interface CommandPaletteProps {
  onCreateCustomer: () => void
  onCreateDeal: () => void
}

export function CommandPalette({ onCreateCustomer, onCreateDeal }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const customersQuery = useCustomers({ search: search.trim(), limit: 8, enabled: open && Boolean(search.trim()) })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function select(action: () => void) {
    setOpen(false)
    setSearch('')
    action()
  }

  return (
    <>
      <button aria-label="打开全局搜索" className="hidden h-9 w-64 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-left text-xs text-slate-400 transition-colors hover:border-indigo-200 hover:bg-white md:flex" onClick={() => setOpen(true)} type="button"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索客户、商机...</span><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl K</kbd></button>
      <button aria-label="打开全局搜索" className="grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setOpen(true)} type="button"><Search aria-hidden="true" className="size-4" /></button>
      <CommandDialog onOpenChange={setOpen} open={open}>
        <Command shouldFilter={false}>
          <CommandInput onValueChange={setSearch} placeholder="搜索客户、商机或快捷操作..." value={search} />
          <CommandList>
            <CommandEmpty>未找到匹配的内容</CommandEmpty>
            <CommandGroup heading="快捷跳转">
              <CommandItem onSelect={() => select(() => navigate('/dashboard'))}><LayoutDashboard aria-hidden="true" className="size-4" />跳转到：仪表盘</CommandItem>
              <CommandItem onSelect={() => select(() => navigate('/customers'))}><UsersRound aria-hidden="true" className="size-4" />跳转到：客户池</CommandItem>
              <CommandItem onSelect={() => select(() => navigate('/deals'))}><BriefcaseBusiness aria-hidden="true" className="size-4" />跳转到：商机看板</CommandItem>
            </CommandGroup>
            <CommandGroup heading="快捷新建">
              <CommandItem onSelect={() => select(onCreateCustomer)}><Plus aria-hidden="true" className="size-4" />新建：客户</CommandItem>
              <CommandItem onSelect={() => select(onCreateDeal)}><Plus aria-hidden="true" className="size-4" />新建：商机</CommandItem>
            </CommandGroup>
            {search.trim() && <CommandGroup heading="客户搜索结果">
              {customersQuery.data?.data.map((customer) => <CommandItem key={customer.id} onSelect={() => select(() => navigate(`/customers/${customer.id}`))}><UsersRound aria-hidden="true" className="size-4" /><span>{customer.name}</span><span className="ml-auto text-xs text-slate-400">{customer.contactPhone ?? '未填写电话'}</span></CommandItem>)}
            </CommandGroup>}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
