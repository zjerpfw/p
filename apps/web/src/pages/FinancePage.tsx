// apps/web/src/pages/FinancePage.tsx
import { format } from 'date-fns'
import { FileText, HandCoins, ReceiptText, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useContracts, useFinanceSummary, useInvoices, usePayments } from '@/hooks/useAssets'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

type LedgerTab = 'contracts' | 'invoices' | 'payments'

const tabs: Array<{ id: LedgerTab; label: string }> = [
  { id: 'contracts', label: '合同台账' },
  { id: 'invoices', label: '发票台账' },
  { id: 'payments', label: '回款台账' },
]

const contractStatus: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  Draft: { label: '草稿', tone: 'neutral' }, Active: { label: '生效', tone: 'success' }, Expired: { label: '已到期', tone: 'warning' }, Terminated: { label: '已终止', tone: 'danger' }, Void: { label: '已作废', tone: 'neutral' },
}
const invoiceStatus: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  Draft: { label: '草稿', tone: 'neutral' }, Issued: { label: '已开票', tone: 'success' }, Voided: { label: '已作废', tone: 'danger' },
}
const paymentStatus: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  Pending: { label: '待到账', tone: 'warning' }, Received: { label: '已到账', tone: 'success' }, Reversed: { label: '已冲销', tone: 'danger' },
}

function formatDate(value: string | null) {
  return value ? format(new Date(value), 'yyyy-MM-dd') : '-'
}

function StatusBadge({ item }: { item: { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' } }) {
  return <Badge tone={item.tone}>{item.label}</Badge>
}

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<LedgerTab>('contracts')
  const summary = useFinanceSummary()
  const contracts = useContracts({ limit: 10_000 })
  const invoices = useInvoices({ limit: 10_000 })
  const payments = usePayments({ limit: 10_000 })
  const isLoading = summary.isLoading || contracts.isLoading || invoices.isLoading || payments.isLoading
  const error = summary.error ?? contracts.error ?? invoices.error ?? payments.error

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载财务台账...</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  const metrics = [
    { label: '合同金额', value: formatCents(summary.data?.contract_amount_cents), description: `${summary.data?.contract_count ?? 0} 份有效合同`, icon: FileText, color: 'text-indigo-600' },
    { label: '实际回款', value: formatCents(summary.data?.received_amount_cents), description: '仅统计已到账记录', icon: HandCoins, color: 'text-emerald-600' },
    { label: '待回款', value: formatCents(summary.data?.outstanding_amount_cents), description: '合同金额减实际回款', icon: WalletCards, color: 'text-rose-600' },
    { label: '已开票金额', value: formatCents(summary.data?.issued_invoice_amount_cents), description: '仅统计已开票发票', icon: ReceiptText, color: 'text-amber-600' },
  ]

  return <section className="space-y-6">
    <div><p className="text-xs font-semibold text-indigo-600">财务管理</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">财务台账</h1><p className="mt-1 text-sm text-muted-foreground">跨客户核对合同、开票和回款进度。</p></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, description, icon: Icon, color }) => <Card className="gap-0 py-0" key={label}>
        <CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><Icon aria-hidden="true" className={cn('size-4', color)} /></CardHeader>
        <CardContent className="px-5 pb-5"><strong className="text-2xl text-slate-900">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{description}</p></CardContent>
      </Card>)}</div>

    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>业务台账</CardTitle><p className="mt-1 text-xs text-muted-foreground">数据范围跟随当前客户负责人权限。</p></div><div aria-label="台账类型" className="flex w-full rounded-md border border-slate-200 bg-slate-50 p-1 sm:w-auto" role="tablist">
        {tabs.map((tab) => <button aria-selected={activeTab === tab.id} className={cn('h-8 flex-1 rounded px-3 text-sm font-medium transition-colors sm:flex-none', activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')} key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" type="button">{tab.label}</button>)}
      </div></CardHeader>
      <CardContent className="p-0">
        {activeTab === 'contracts' && <Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>状态</TableHead><TableHead>回款截止日</TableHead><TableHead className="text-right">合同金额</TableHead><TableHead className="text-right">已回款</TableHead><TableHead className="text-right">待回款</TableHead></TableRow></TableHeader><TableBody>
          {contracts.data?.data.map((contract) => <TableRow key={contract.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${contract.customer_id}`}>{contract.customer_name}</Link></TableCell><TableCell><p className="font-medium text-slate-800">{contract.contract_number}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{contract.title}</p></TableCell><TableCell><StatusBadge item={contractStatus[contract.status]} /></TableCell><TableCell>{formatDate(contract.payment_due_at)}</TableCell><TableCell className="text-right">{formatCents(contract.total_amount_cents)}</TableCell><TableCell className="text-right text-emerald-700">{formatCents(contract.received_amount_cents)}</TableCell><TableCell className="text-right font-semibold text-rose-700">{formatCents(contract.outstanding_amount_cents)}</TableCell></TableRow>)}
          {contracts.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无合同记录</TableCell></TableRow>}
        </TableBody></Table>}
        {activeTab === 'invoices' && <Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>发票号码</TableHead><TableHead>状态</TableHead><TableHead>开票日期</TableHead><TableHead className="text-right">开票金额</TableHead></TableRow></TableHeader><TableBody>
          {invoices.data?.data.map((invoice) => <TableRow key={invoice.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${invoice.customer_id}`}>{invoice.customer_name}</Link></TableCell><TableCell>{invoice.contract_number}</TableCell><TableCell><p>{invoice.invoice_number ?? '-'}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{invoice.title}</p></TableCell><TableCell><StatusBadge item={invoiceStatus[invoice.status]} /></TableCell><TableCell>{formatDate(invoice.issued_at)}</TableCell><TableCell className="text-right font-semibold">{formatCents(invoice.amount_cents)}</TableCell></TableRow>)}
          {invoices.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>暂无发票记录</TableCell></TableRow>}
        </TableBody></Table>}
        {activeTab === 'payments' && <Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>回款编号</TableHead><TableHead>状态</TableHead><TableHead>到账日期</TableHead><TableHead className="text-right">回款金额</TableHead></TableRow></TableHeader><TableBody>
          {payments.data?.data.map((payment) => <TableRow key={payment.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${payment.customer_id}`}>{payment.customer_name}</Link></TableCell><TableCell>{payment.contract_number}</TableCell><TableCell><p>{payment.payment_number}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{payment.invoice_number ? `发票：${payment.invoice_number}` : payment.note ?? '未关联发票'}</p></TableCell><TableCell><StatusBadge item={paymentStatus[payment.status]} /></TableCell><TableCell>{formatDate(payment.paid_at)}</TableCell><TableCell className="text-right font-semibold">{formatCents(payment.amount_cents)}</TableCell></TableRow>)}
          {payments.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>暂无回款记录</TableCell></TableRow>}
        </TableBody></Table>}
      </CardContent>
    </Card>
  </section>
}
