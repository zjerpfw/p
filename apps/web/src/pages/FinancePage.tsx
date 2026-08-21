// apps/web/src/pages/FinancePage.tsx
import { format } from 'date-fns'
import { Download, FileText, HandCoins, ReceiptText, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useContracts, useFinanceSummary, useInvoices, usePayments } from '@/hooks/useAssets'
import { useUsers } from '@/hooks/useUsers'
import { getCurrentUserRole } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { downloadApiFile } from '@/lib/api'
import { toast } from 'sonner'

type LedgerTab = 'contracts' | 'invoices' | 'payments'
type LedgerStatus = 'Draft' | 'Active' | 'Expired' | 'Terminated' | 'Void' | 'Issued' | 'Voided' | 'Pending' | 'Received' | 'Reversed'

const tabs: Array<{ id: LedgerTab; label: string }> = [
  { id: 'contracts', label: '合同台账' },
  { id: 'invoices', label: '发票台账' },
  { id: 'payments', label: '回款台账' },
]
const statusOptions: Record<LedgerTab, Array<{ value: LedgerStatus; label: string }>> = {
  contracts: [{ value: 'Draft', label: '草稿' }, { value: 'Active', label: '生效' }, { value: 'Expired', label: '已到期' }, { value: 'Terminated', label: '已终止' }, { value: 'Void', label: '已作废' }],
  invoices: [{ value: 'Draft', label: '草稿' }, { value: 'Issued', label: '已开票' }, { value: 'Voided', label: '已作废' }],
  payments: [{ value: 'Pending', label: '待到账' }, { value: 'Received', label: '已到账' }, { value: 'Reversed', label: '已冲销' }],
}

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

import { useIsMobile } from '@/hooks/use-mobile'

export default function FinancePage() {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<LedgerTab>('contracts')
  const [status, setStatus] = useState<LedgerStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const isAdmin = getCurrentUserRole() === 'admin'
  const usersQuery = useUsers()
  const summary = useFinanceSummary(ownerId || undefined)
  const selectedStatus = status || undefined
  const contracts = useContracts({ limit: 10_000, status: activeTab === 'contracts' ? selectedStatus : undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, owner_id: ownerId || undefined })
  const invoices = useInvoices({ limit: 10_000, status: activeTab === 'invoices' ? selectedStatus : undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, owner_id: ownerId || undefined })
  const payments = usePayments({ limit: 10_000, status: activeTab === 'payments' ? selectedStatus : undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, owner_id: ownerId || undefined })
  const isLoading = summary.isLoading || contracts.isLoading || invoices.isLoading || payments.isLoading
  const error = summary.error ?? contracts.error ?? invoices.error ?? payments.error

  async function exportLedger() {
    const filenames: Record<LedgerTab, string> = { contracts: '合同台账.csv', invoices: '发票台账.csv', payments: '回款台账.csv' }
    try {
      const query = new URLSearchParams({ kind: activeTab })
      if (status) query.set('status', status)
      if (dateFrom) query.set('date_from', dateFrom)
      if (dateTo) query.set('date_to', dateTo)
      if (ownerId) query.set('owner_id', ownerId)
      await downloadApiFile(`/api/finance/export/csv?${query.toString()}`, filenames[activeTab])
      toast.success(`${tabs.find((tab) => tab.id === activeTab)?.label}已开始下载`)
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : '财务台账导出失败')
    }
  }

  if (isLoading) return <p className="py-10 text-center text-xs text-muted-foreground">正在加载财务台账...</p>
  if (error) return <p className="py-10 text-center text-xs text-destructive">{error.message}</p>

  const metrics = [
    { label: '合同金额', value: formatCents(summary.data?.contract_amount_cents), description: `${summary.data?.contract_count ?? 0} 份合同`, icon: FileText, color: 'text-indigo-600' },
    { label: '实际回款', value: formatCents(summary.data?.received_amount_cents), description: '已到账回款', icon: HandCoins, color: 'text-emerald-600' },
    { label: '待回款', value: formatCents(summary.data?.outstanding_amount_cents), description: '应收未收', icon: WalletCards, color: 'text-rose-600' },
    { label: '已开票', value: formatCents(summary.data?.issued_invoice_amount_cents), description: '生效发票', icon: ReceiptText, color: 'text-amber-600' },
  ]

  return (
    <section className="space-y-3.5 md:space-y-6 pb-8">
      {/* 桌面端大标题 */}
      <div className="hidden md:block">
        <p className="text-xs font-semibold text-indigo-600">财务管理</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">财务台账</h1>
        <p className="mt-1 text-sm text-muted-foreground">跨客户核对合同、开票和回款进度。</p>
      </div>

      {/* 4 大财务指标：移动端 2x2 网格 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, description, icon: Icon, color }) => (
          <Card className="gap-0 py-0 border-slate-200/80 shadow-sm" key={label}>
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 md:px-5 md:py-4">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon aria-hidden="true" className={cn('size-4', color)} />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:px-5 md:pb-5">
              <strong className="text-lg md:text-2xl font-bold tracking-tight text-slate-900 truncate block">{value}</strong>
              <p className="mt-0.5 text-[10px] md:text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 台账卡片 */}
      <Card className="gap-0 overflow-hidden py-0 border-slate-200/80 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-200 p-3.5 md:px-5 md:py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div>
              <CardTitle className="text-sm md:text-base font-semibold">业务台账</CardTitle>
              <p className="text-[11px] md:text-xs text-muted-foreground hidden sm:block">数据范围跟随当前客户负责人权限。</p>
            </div>
            {/* 移动端导出按钮 */}
            <button
              aria-label="导出台账 CSV"
              className="sm:hidden inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm"
              onClick={() => void exportLedger()}
              type="button"
            >
              <Download aria-hidden="true" className="size-3.5" />
              导出
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 台账类型分段 Tab */}
            <div aria-label="台账类型" className="flex w-full sm:w-auto rounded-lg border border-slate-200/80 bg-slate-100 p-0.5" role="tablist">
              {tabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={cn(
                    'h-7.5 flex-1 rounded-md px-3 text-xs font-semibold transition-colors sm:flex-none',
                    activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setStatus('') }}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 桌面端状态与日期筛选器 */}
            <div className="hidden sm:flex items-center gap-2">
              {isAdmin && (
                <select aria-label="按负责人筛选台账" className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700" onChange={(event) => setOwnerId(event.target.value)} value={ownerId}>
                  <option value="">全部负责人</option>
                  {usersQuery.data?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              )}
              <select aria-label="按状态筛选台账" className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700" onChange={(event) => setStatus(event.target.value as LedgerStatus | '')} value={status}>
                <option value="">全部状态</option>
                {statusOptions[activeTab].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button aria-label="导出台账 CSV" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => void exportLedger()} type="button">
                <Download aria-hidden="true" className="size-3.5" />
                导出 CSV
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* 移动端卡片式流式渲染 */}
          {isMobile ? (
            <div className="divide-y divide-border">
              {/* 合同卡片 */}
              {activeTab === 'contracts' && contracts.data?.data.map((contract) => (
                <div key={contract.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/customers/${contract.customer_id}`} className="font-bold text-sm text-slate-900 hover:text-indigo-600 truncate">
                      {contract.customer_name}
                    </Link>
                    <StatusBadge item={contractStatus[contract.status]} />
                  </div>
                  <p className="text-xs text-muted-foreground">{contract.contract_number} · {contract.title}</p>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <div>
                      <span className="text-slate-400">总金额: </span>
                      <strong className="text-slate-900">{formatCents(contract.total_amount_cents)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">待回款: </span>
                      <strong className="text-rose-600">{formatCents(contract.outstanding_amount_cents)}</strong>
                    </div>
                  </div>
                </div>
              ))}

              {/* 发票卡片 */}
              {activeTab === 'invoices' && invoices.data?.data.map((invoice) => (
                <div key={invoice.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/customers/${invoice.customer_id}`} className="font-bold text-sm text-slate-900 hover:text-indigo-600 truncate">
                      {invoice.customer_name}
                    </Link>
                    <StatusBadge item={invoiceStatus[invoice.status]} />
                  </div>
                  <p className="text-xs text-muted-foreground">发票号: {invoice.invoice_number ?? '-'} · 合同 {invoice.contract_number}</p>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <span className="text-slate-400">开票日: {formatDate(invoice.issued_at)}</span>
                    <strong className="text-slate-900 font-bold">{formatCents(invoice.amount_cents)}</strong>
                  </div>
                </div>
              ))}

              {/* 回款卡片 */}
              {activeTab === 'payments' && payments.data?.data.map((payment) => (
                <div key={payment.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/customers/${payment.customer_id}`} className="font-bold text-sm text-slate-900 hover:text-indigo-600 truncate">
                      {payment.customer_name}
                    </Link>
                    <StatusBadge item={paymentStatus[payment.status]} />
                  </div>
                  <p className="text-xs text-muted-foreground">{payment.payment_number} · 合同 {payment.contract_number}</p>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <span className="text-slate-400">到账日: {formatDate(payment.paid_at)}</span>
                    <strong className="text-emerald-700 font-bold">{formatCents(payment.amount_cents)}</strong>
                  </div>
                </div>
              ))}

              {((activeTab === 'contracts' && contracts.data?.data.length === 0) ||
                (activeTab === 'invoices' && invoices.data?.data.length === 0) ||
                (activeTab === 'payments' && payments.data?.data.length === 0)) && (
                <p className="py-8 text-center text-xs text-muted-foreground">暂无记录</p>
              )}
            </div>
          ) : (
            /* 桌面端表格 */
            <>
              {activeTab === 'contracts' && (
                <Table>
                  <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>状态</TableHead><TableHead>回款截止日</TableHead><TableHead className="text-right">合同金额</TableHead><TableHead className="text-right">已回款</TableHead><TableHead className="text-right">待回款</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {contracts.data?.data.map((contract) => <TableRow key={contract.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${contract.customer_id}`}>{contract.customer_name}</Link></TableCell><TableCell><p className="font-medium text-slate-800">{contract.contract_number}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{contract.title}</p></TableCell><TableCell><StatusBadge item={contractStatus[contract.status]} /></TableCell><TableCell>{formatDate(contract.payment_due_at)}</TableCell><TableCell className="text-right">{formatCents(contract.total_amount_cents)}</TableCell><TableCell className="text-right text-emerald-700">{formatCents(contract.received_amount_cents)}</TableCell><TableCell className="text-right font-semibold text-rose-700">{formatCents(contract.outstanding_amount_cents)}</TableCell></TableRow>)}
                    {contracts.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无合同记录</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              {activeTab === 'invoices' && (
                <Table>
                  <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>发票号码</TableHead><TableHead>状态</TableHead><TableHead>开票日期</TableHead><TableHead className="text-right">开票金额</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoices.data?.data.map((invoice) => <TableRow key={invoice.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${invoice.customer_id}`}>{invoice.customer_name}</Link></TableCell><TableCell>{invoice.contract_number}</TableCell><TableCell><p>{invoice.invoice_number ?? '-'}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{invoice.title}</p></TableCell><TableCell><StatusBadge item={invoiceStatus[invoice.status]} /></TableCell><TableCell>{formatDate(invoice.issued_at)}</TableCell><TableCell className="text-right font-semibold">{formatCents(invoice.amount_cents)}</TableCell></TableRow>)}
                    {invoices.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>暂无发票记录</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              {activeTab === 'payments' && (
                <Table>
                  <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>回款编号</TableHead><TableHead>状态</TableHead><TableHead>到账日期</TableHead><TableHead className="text-right">回款金额</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {payments.data?.data.map((payment) => <TableRow key={payment.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${payment.customer_id}`}>{payment.customer_name}</Link></TableCell><TableCell>{payment.contract_number}</TableCell><TableCell><p>{payment.payment_number}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{payment.invoice_number ? `发票：${payment.invoice_number}` : payment.note ?? '未关联发票'}</p></TableCell><TableCell><StatusBadge item={paymentStatus[payment.status]} /></TableCell><TableCell>{formatDate(payment.paid_at)}</TableCell><TableCell className="text-right font-semibold">{formatCents(payment.amount_cents)}</TableCell></TableRow>)}
                    {payments.data?.data.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>暂无回款记录</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
