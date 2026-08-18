// apps/web/src/components/customers/CustomerFinancePanel.tsx
import { format } from 'date-fns'
import { FileText, Plus, ReceiptText, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useContracts, useInvoices, usePayments } from '@/hooks/useAssets'
import { formatCents } from '@/lib/money'

interface CustomerFinancePanelProps {
  customerId: string
  canManage: boolean
  onCreateContract: () => void
  onCreateInvoice: () => void
  onCreatePayment: () => void
}

function formatDate(value: string | null) {
  if (!value) return '未登记'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日期无效' : format(date, 'yyyy-MM-dd')
}

function contractStatusLabel(status: string) {
  const labels: Record<string, string> = { Draft: '草稿', Active: '生效中', Expired: '已到期', Terminated: '已终止', Void: '已作废' }
  return labels[status] ?? status
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = { Draft: '草稿', Issued: '已开票', Voided: '已作废' }
  return labels[status] ?? status
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = { Pending: '待确认', Received: '已到账', Reversed: '已冲回' }
  return labels[status] ?? status
}

export function CustomerFinancePanel({ customerId, canManage, onCreateContract, onCreateInvoice, onCreatePayment }: CustomerFinancePanelProps) {
  const contractsQuery = useContracts({ customer_id: customerId, limit: 100, enabled: Boolean(customerId) })
  const invoicesQuery = useInvoices({ customer_id: customerId, limit: 100, enabled: Boolean(customerId) })
  const paymentsQuery = usePayments({ customer_id: customerId, limit: 100, enabled: Boolean(customerId) })
  const isLoading = contractsQuery.isLoading || invoicesQuery.isLoading || paymentsQuery.isLoading
  const error = contractsQuery.error ?? invoicesQuery.error ?? paymentsQuery.error
  const contracts = contractsQuery.data?.data ?? []
  const invoices = invoicesQuery.data?.data ?? []
  const payments = paymentsQuery.data?.data ?? []

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>合同与财务</CardTitle>
          {canManage && (
            <div className="flex items-center gap-1">
              <Button aria-label="新建合同" onClick={onCreateContract} size="icon-xs" title="新建合同" type="button" variant="ghost"><Plus /></Button>
              <Button aria-label="申请开票" onClick={onCreateInvoice} size="icon-xs" title="申请开票" type="button" variant="ghost"><ReceiptText /></Button>
              <Button aria-label="登记回款" onClick={onCreatePayment} size="icon-xs" title="登记回款" type="button" variant="ghost"><WalletCards /></Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isLoading && <p className="py-3 text-sm text-muted-foreground">正在加载合同与财务数据...</p>}
        {error && <p className="py-3 text-sm text-destructive">{error instanceof Error ? error.message : '合同与财务数据加载失败'}</p>}
        {!isLoading && !error && contracts.map((contract) => {
          const contractInvoices = invoices.filter((invoice) => invoice.contract_id === contract.id)
          const contractPayments = payments.filter((payment) => payment.contract_id === contract.id)
          return (
            <article className="overflow-hidden rounded-md border border-slate-200 bg-white" key={contract.id}>
              <div className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{contract.contract_number}</p><p className="mt-1 truncate text-xs text-muted-foreground">{contract.title}</p></div>
                  <Badge tone={contract.status === 'Active' ? 'success' : contract.status === 'Void' ? 'danger' : 'neutral'}>{contractStatusLabel(contract.status)}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">合同总额</p><p className="mt-1 font-semibold text-slate-800">{formatCents(contract.total_amount_cents)}</p></div>
                  <div><p className="text-muted-foreground">已回款</p><p className="mt-1 font-semibold text-emerald-700">{formatCents(contract.received_amount_cents)}</p></div>
                  <div><p className="text-muted-foreground">待回款</p><p className="mt-1 font-semibold text-amber-700">{formatCents(contract.outstanding_amount_cents)}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">生效期：{formatDate(contract.effective_start_date)} 至 {formatDate(contract.effective_end_date)}</p>
                <p className={contract.payment_due_at && new Date(contract.payment_due_at) < new Date() && contract.outstanding_amount_cents > 0 ? 'text-xs font-medium text-rose-700' : 'text-xs text-muted-foreground'}>回款截止日：{formatDate(contract.payment_due_at)}</p>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><ReceiptText className="size-3.5" />开票记录</p>
                {contractInvoices.length > 0 ? <div className="mt-2 space-y-1.5">{contractInvoices.map((invoice) => <div className="flex items-center justify-between gap-2 text-xs" key={invoice.id}><span className="min-w-0 truncate">{invoice.invoice_number ?? invoice.title}</span><span className="shrink-0 font-medium">{formatCents(invoice.amount_cents)}</span><Badge tone={invoice.status === 'Issued' ? 'success' : invoice.status === 'Voided' ? 'danger' : 'neutral'}>{invoiceStatusLabel(invoice.status)}</Badge></div>)}</div> : <p className="mt-1.5 text-xs text-muted-foreground">暂无开票记录</p>}
              </div>

              <div className="border-t border-slate-100 bg-emerald-50/30 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><WalletCards className="size-3.5" />回款流水</p>
                {contractPayments.length > 0 ? <div className="mt-2 space-y-1.5">{contractPayments.map((payment) => <div className="flex items-center justify-between gap-2 text-xs" key={payment.id}><span className="min-w-0 truncate">{payment.payment_number} · {formatDate(payment.paid_at)}</span><span className="shrink-0 font-semibold text-emerald-700">{formatCents(payment.amount_cents)}</span><Badge tone={payment.status === 'Received' ? 'success' : payment.status === 'Reversed' ? 'danger' : 'warning'}>{paymentStatusLabel(payment.status)}</Badge></div>)}</div> : <p className="mt-1.5 text-xs text-muted-foreground">暂无回款记录</p>}
              </div>
            </article>
          )
        })}
        {!isLoading && !error && contracts.length === 0 && <div className="py-5 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-2 size-5" />暂无合同与财务记录</div>}
      </CardContent>
    </Card>
  )
}
