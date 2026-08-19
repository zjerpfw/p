import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { CalendarClock, MapPinned, Phone, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PaginationControls } from '@/components/PaginationControls'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useIsMobile } from '@/hooks/use-mobile'
import { type WonCustomerExpiryBucket, useWonCustomers } from '@/hooks/useWonCustomers'

const expiryOptions: Array<{ value: WonCustomerExpiryBucket; label: string }> = [
  { value: 'expired', label: '已到期' },
  { value: 'within_30', label: '30 天内到期' },
  { value: 'within_90', label: '31-90 天到期' },
  { value: 'beyond_90', label: '90 天后到期' },
  { value: 'unspecified', label: '未填写服务期' },
]

function expiryState(expireDate: string | null) {
  if (!expireDate) return { label: '服务期未填写', tone: 'neutral' as const }
  const days = differenceInCalendarDays(startOfDay(new Date(expireDate)), startOfDay(new Date()))
  if (days < 0) return { label: `已到期 ${Math.abs(days)} 天`, tone: 'danger' as const }
  if (days <= 30) return { label: `${days} 天内到期`, tone: 'warning' as const }
  return { label: `${days} 天后到期`, tone: 'success' as const }
}

function formatAmount(amountCents: number | null) {
  if (amountCents === null) return '金额待补充'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amountCents / 100)
}

export default function WonCustomersPage() {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [provinces, setProvinces] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [expiry, setExpiry] = useState<WonCustomerExpiryBucket[]>([])
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search.trim())
  const wonCustomersQuery = useWonCustomers({ search: debouncedSearch, provinces, cities, expiry, page })
  const regions = wonCustomersQuery.data?.regions ?? []
  const provinceOptions = [...new Set(regions.map((region) => region.province).filter((value): value is string => Boolean(value)))].sort()
  const cityOptions = [...new Set(regions.filter((region) => provinces.length === 0 || (region.province && provinces.includes(region.province))).map((region) => region.city).filter((value): value is string => Boolean(value)))].sort()

  function toggleValue<T>(current: T[], value: T, onChange: (values: T[]) => void) {
    onChange(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    setPage(1)
  }

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-600">客户经营</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900"><MapPinned aria-hidden="true" className="size-6" />成交客户</h1><p className="mt-1 text-sm text-muted-foreground">按地域和服务到期时间规划拜访，成交历史不会混入活跃商机看板。</p></div><div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{wonCustomersQuery.data?.total ?? 0} 位已成交客户</div></div>
    <Card className="gap-0 py-0"><CardContent className="space-y-4 p-4"><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9 pr-9" onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="搜索客户名称、电话或联系人" value={search} />{search && <Button aria-label="清空成交客户搜索" className="absolute right-1 top-0.5" onClick={() => { setSearch(''); setPage(1) }} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}</div>
      <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">省份（可多选）</p><div className="flex flex-wrap gap-2">{provinceOptions.map((province) => <Button aria-pressed={provinces.includes(province)} key={province} onClick={() => toggleValue(provinces, province, setProvinces)} size="sm" type="button" variant={provinces.includes(province) ? 'default' : 'outline'}>{province}</Button>)}{provinceOptions.length === 0 && <span className="text-sm text-muted-foreground">暂无已填写省份的成交客户</span>}</div></div>
      <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">城市（可多选）</p><div className="flex flex-wrap gap-2">{cityOptions.map((city) => <Button aria-pressed={cities.includes(city)} key={city} onClick={() => toggleValue(cities, city, setCities)} size="sm" type="button" variant={cities.includes(city) ? 'default' : 'outline'}>{city}</Button>)}{cityOptions.length === 0 && <span className="text-sm text-muted-foreground">先录入成交客户的城市信息即可按城市规划拜访</span>}</div></div>
      <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">服务到期时间（可多选）</p><div className="flex flex-wrap gap-2">{expiryOptions.map((option) => <Button aria-pressed={expiry.includes(option.value)} key={option.value} onClick={() => toggleValue(expiry, option.value, setExpiry)} size="sm" type="button" variant={expiry.includes(option.value) ? 'default' : 'outline'}>{option.label}</Button>)}</div></div>
    </CardContent></Card>
    {wonCustomersQuery.isLoading && <p className="py-10 text-sm text-muted-foreground">正在加载成交客户...</p>}
    {wonCustomersQuery.isError && <p className="py-10 text-sm text-destructive">{wonCustomersQuery.error instanceof Error ? wonCustomersQuery.error.message : '成交客户加载失败'}</p>}
    {wonCustomersQuery.data && (isMobile ? <div className="space-y-3">{wonCustomersQuery.data.data.map((customer) => { const expiryInfo = expiryState(customer.saasExpireDate); return <Link className="block" key={customer.id} to={`/customers/${customer.id}`}><Card className="gap-0 border-slate-200 py-0 transition-colors active:bg-slate-50"><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{customer.name}</h2><p className="mt-1 text-sm text-slate-600">{[customer.province, customer.city].filter(Boolean).join(' ') || '地域待完善'}</p></div><Badge className="shrink-0" tone={expiryInfo.tone}>{expiryInfo.label}</Badge></div><div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3"><div><p className="text-xs text-muted-foreground">成交金额</p><p className="mt-0.5 font-semibold text-slate-900">{formatAmount(customer.latestWonAmountCents)}</p></div><div className="text-right text-xs text-muted-foreground"><p>{customer.latestProductName ?? '产品待补充'}</p>{customer.saasExpireDate && <p className="mt-1 inline-flex items-center gap-1"><CalendarClock aria-hidden="true" className="size-3.5" />{format(new Date(customer.saasExpireDate), 'yyyy-MM-dd')}</p>}</div></div></CardContent></Card></Link> })}{wonCustomersQuery.data.data.length === 0 && <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">当前筛选条件下暂无成交客户</CardContent></Card>}<PaginationControls onPageChange={setPage} page={wonCustomersQuery.data.page} total={wonCustomersQuery.data.total} totalPages={wonCustomersQuery.data.totalPages} /></div> : <Card className="gap-0 overflow-hidden py-0"><CardContent className="divide-y divide-border p-0">{wonCustomersQuery.data.data.map((customer) => { const expiryInfo = expiryState(customer.saasExpireDate); return <Link className="block p-5 transition-colors hover:bg-slate-50" key={customer.id} to={`/customers/${customer.id}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{customer.name}</h2><Badge tone={expiryInfo.tone}>{expiryInfo.label}</Badge>{customer.latestProductName && <Badge tone="info">{customer.latestProductName}</Badge>}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span className="inline-flex items-center gap-1"><MapPinned aria-hidden="true" className="size-4 text-emerald-600" />{[customer.province, customer.city, customer.address].filter(Boolean).join(' ') || '地域待完善'}</span><span className="inline-flex items-center gap-1"><Phone aria-hidden="true" className="size-4 text-slate-400" />{customer.contactPhone ?? '未填写电话'}</span></div></div><div className="shrink-0 text-right text-xs text-muted-foreground"><p className="font-semibold text-slate-800">{formatAmount(customer.latestWonAmountCents)}</p><p>归属：{customer.ownerName ?? customer.ownerId}</p>{customer.saasExpireDate && <p className="mt-1 inline-flex items-center gap-1"><CalendarClock aria-hidden="true" className="size-3.5" />到期 {format(new Date(customer.saasExpireDate), 'yyyy-MM-dd')}</p>}</div></div></Link> })}{wonCustomersQuery.data.data.length === 0 && <p className="py-14 text-center text-sm text-muted-foreground">当前筛选条件下暂无成交客户</p>}<PaginationControls onPageChange={setPage} page={wonCustomersQuery.data.page} total={wonCustomersQuery.data.total} totalPages={wonCustomersQuery.data.totalPages} /></CardContent></Card>)}
  </section>
}
