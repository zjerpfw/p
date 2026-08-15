// apps/web/src/pages/CustomersPage.tsx
import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PaginationControls } from '@/components/PaginationControls'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useCustomers } from '@/hooks/useCustomers'
import { getCustomerStatusLabel } from '@/lib/presentation'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data, error, isLoading } = useCustomers({ search: debouncedSearch, status, page })
  const statuses = ['Active', 'Inactive']

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateStatus(value: string) {
    setStatus(value)
    setPage(1)
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">客户池</h1>
          <p className="mt-1 text-sm text-muted-foreground">集中管理客户资料与跟进状态。</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} type="button"><Plus aria-hidden="true" />新建客户</Button>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 pr-9" onChange={(event) => updateSearch(event.target.value)} placeholder="搜索客户名称" value={search} />
          {search && <Button aria-label="清空客户搜索" className="absolute right-1 top-0.5" onClick={() => updateSearch('')} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}
        </div>
        <select aria-label="客户状态筛选" className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-36" onChange={(event) => updateStatus(event.target.value)} value={status}>
          <option value="">全部状态</option>
          {statuses.map((item) => <option key={item} value={item}>{getCustomerStatusLabel(item)}</option>)}
        </select>
      </div>
      {isLoading && <p className="mt-8 text-sm text-muted-foreground">正在加载客户数据...</p>}
      {error && <p className="mt-8 text-sm text-destructive">{error.message}</p>}
      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {data.data.map((customer) => (
            <Link
              className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
              key={customer.id}
              to={`/customers/${customer.id}`}
            >
              <span className="font-medium">{customer.name}</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {getCustomerStatusLabel(customer.status)}
                <ChevronRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          ))}
          {data.data.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">未找到匹配的客户</p>}
          <PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
        </div>
      )}
      <CreateCustomerModal onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
    </section>
  )
}
