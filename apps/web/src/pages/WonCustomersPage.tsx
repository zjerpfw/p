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

  return (
    <section className="space-y-3.5 md:space-y-6">
      {/* 桌面端大标题 */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-600">客户经营</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <MapPinned aria-hidden="true" className="size-6 text-emerald-600" />
            成交客户
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">按地域和服务到期时间规划拜访，成交历史不会混入活跃商机看板。</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {wonCustomersQuery.data?.total ?? 0} 位已成交客户
        </div>
      </div>

      {/* 搜索与筛选卡片 */}
      <Card className="gap-0 py-0 border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4 space-y-2.5">
          {/* 搜索框 */}
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-10 pl-9 pr-9 text-sm bg-white border-slate-200 rounded-lg shadow-sm"
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              placeholder="搜索客户名称、电话或联系人..."
              value={search}
            />
            {search && (
              <Button aria-label="清空搜索" className="absolute right-1 top-1 size-8" onClick={() => { setSearch(''); setPage(1) }} size="icon-xs" type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>

          {/* 服务到期时间 - 移动端横向滑动胶囊 */}
          <div>
            <p className="hidden md:block text-xs font-semibold text-slate-500 mb-1.5">服务到期时间</p>
            <div className="flex overflow-x-auto gap-1.5 no-scrollbar py-0.5" role="tablist">
              <button
                className={`shrink-0 h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                  expiry.length === 0
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
                onClick={() => { setExpiry([]); setPage(1) }}
                type="button"
              >
                全部到期状态 ({wonCustomersQuery.data?.total ?? 0})
              </button>
              {expiryOptions.map((option) => {
                const isSelected = expiry.includes(option.value)
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`shrink-0 h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                    }`}
                    key={option.value}
                    onClick={() => toggleValue(expiry, option.value, setExpiry)}
                    type="button"
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 省份与城市 (桌面端全展开，移动端横向滑动) */}
          {provinceOptions.length > 0 && (
            <div className="hidden md:block space-y-2 pt-1 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500">省份（可多选）</p>
              <div className="flex flex-wrap gap-1.5">
                {provinceOptions.map((province) => (
                  <Button
                    aria-pressed={provinces.includes(province)}
                    className="h-7 text-xs"
                    key={province}
                    onClick={() => toggleValue(provinces, province, setProvinces)}
                    size="sm"
                    type="button"
                    variant={provinces.includes(province) ? 'default' : 'outline'}
                  >
                    {province}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {wonCustomersQuery.isLoading && <p className="py-10 text-center text-xs text-muted-foreground">正在加载成交客户...</p>}
      {wonCustomersQuery.isError && <p className="py-10 text-center text-xs text-destructive">{wonCustomersQuery.error instanceof Error ? wonCustomersQuery.error.message : '成交客户加载失败'}</p>}

      {wonCustomersQuery.data && (isMobile ? (
        <div className="space-y-2.5">
          {wonCustomersQuery.data.data.map((customer) => {
            const expiryInfo = expiryState(customer.saasExpireDate)
            return (
              <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm active:bg-slate-50 transition-colors" key={customer.id}>
                <CardContent className="space-y-2.5 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/customers/${customer.id}`} className="min-w-0 flex-1">
                      <h2 className="truncate font-bold text-sm text-slate-900 leading-snug">{customer.name}</h2>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <MapPinned className="size-3 shrink-0 text-emerald-600" />
                        {[customer.province, customer.city].filter(Boolean).join(' ') || '地域待完善'}
                      </p>
                    </Link>
                    <Badge className="shrink-0 text-[10px]" tone={expiryInfo.tone}>
                      {expiryInfo.label}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                    <div>
                      <span className="text-slate-400">成交额: </span>
                      <span className="font-bold text-slate-900">{formatAmount(customer.latestWonAmountCents)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {customer.contactPhone && (
                        <a
                          href={`tel:${customer.contactPhone}`}
                          className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-emerald-700 active:bg-emerald-100 font-medium"
                        >
                          <Phone className="size-3" />
                          拨打
                        </a>
                      )}
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2">
                        <Link to={`/customers/${customer.id}`}>详情 &rarr;</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {wonCustomersQuery.data.data.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-muted-foreground">
              当前筛选条件下暂无成交客户
            </div>
          )}
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <PaginationControls onPageChange={setPage} page={wonCustomersQuery.data.page} total={wonCustomersQuery.data.total} totalPages={wonCustomersQuery.data.totalPages} />
          </div>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-sm">
          <CardContent className="divide-y divide-border p-0">
            {wonCustomersQuery.data.data.map((customer) => {
              const expiryInfo = expiryState(customer.saasExpireDate)
              return (
                <Link className="block p-5 transition-colors hover:bg-slate-50" key={customer.id} to={`/customers/${customer.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">{customer.name}</h2>
                        <Badge tone={expiryInfo.tone}>{expiryInfo.label}</Badge>
                        {customer.latestProductName && <Badge tone="info">{customer.latestProductName}</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <MapPinned aria-hidden="true" className="size-4 text-emerald-600" />
                          {[customer.province, customer.city, customer.address].filter(Boolean).join(' ') || '地域待完善'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone aria-hidden="true" className="size-4 text-slate-400" />
                          {customer.contactPhone ?? '未填写电话'}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p className="font-semibold text-slate-800">{formatAmount(customer.latestWonAmountCents)}</p>
                      <p>归属：{customer.ownerName ?? customer.ownerId}</p>
                      {customer.saasExpireDate && (
                        <p className="mt-1 inline-flex items-center gap-1">
                          <CalendarClock aria-hidden="true" className="size-3.5" />
                          到期 {format(new Date(customer.saasExpireDate), 'yyyy-MM-dd')}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
            {wonCustomersQuery.data.data.length === 0 && (
              <p className="py-14 text-center text-sm text-muted-foreground">当前筛选条件下暂无成交客户</p>
            )}
            <PaginationControls onPageChange={setPage} page={wonCustomersQuery.data.page} total={wonCustomersQuery.data.total} totalPages={wonCustomersQuery.data.totalPages} />
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
