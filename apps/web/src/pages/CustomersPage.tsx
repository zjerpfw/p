// apps/web/src/pages/CustomersPage.tsx
import { useCustomers } from '@/hooks/useCustomers'
import { getCustomerStatusLabel } from '@/lib/presentation'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CustomersPage() {
  const { data, error, isLoading } = useCustomers()

  return (
    <section>
      <h1 className="text-xl font-semibold">客户池</h1>
      <p className="mt-1 text-sm text-muted-foreground">集中管理客户资料与跟进状态。</p>
      {isLoading && <p className="mt-8 text-sm text-muted-foreground">正在加载客户数据...</p>}
      {error && <p className="mt-8 text-sm text-destructive">{error.message}</p>}
      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {data.customers.map((customer) => (
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
        </div>
      )}
    </section>
  )
}
