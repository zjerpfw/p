// apps/web/src/pages/SettingsPage.tsx
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, KeyRound, MapPinned, Save, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'

const CONFIG_QUERY_KEY = ['system-configs'] as const

interface SettingsFormValues {
  amap_key: string
  amap_security_code: string
  wechat_corp_id: string
  wechat_corp_secret: string
  wechat_agent_id: string
  ww_verify_code: string
}

interface ConfigItem {
  key: string
  value: string
  updated_at: string
}

interface ConfigResponse {
  configs: ConfigItem[]
}

interface UpdateConfigResponse {
  updated: number
}

interface WeChatTestResponse {
  sent: boolean
}

const defaultValues: SettingsFormValues = {
  amap_key: '',
  amap_security_code: '',
  wechat_corp_id: '',
  wechat_corp_secret: '',
  wechat_agent_id: '',
  ww_verify_code: '',
}

function toFormValues(configs: ConfigItem[]): SettingsFormValues {
  const values = Object.fromEntries(configs.map(({ key, value }) => [key, value]))
  return {
    amap_key: values.amap_key ?? '',
    amap_security_code: values.amap_security_code ?? '',
    wechat_corp_id: values.wechat_corp_id ?? '',
    wechat_corp_secret: values.wechat_corp_secret ?? '',
    wechat_agent_id: values.wechat_agent_id ?? '',
    ww_verify_code: values.ww_verify_code ?? '',
  }
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const form = useForm<SettingsFormValues>({ defaultValues })
  const configsQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => apiFetch<ConfigResponse>('/api/configs'),
  })
  const loadedValues = useMemo(
    () => toFormValues(configsQuery.data?.configs ?? []),
    [configsQuery.data],
  )

  useEffect(() => {
    if (configsQuery.data) {
      form.reset(loadedValues)
    }
  }, [configsQuery.data, form, loadedValues])

  const updateMutation = useMutation({
    mutationFn: (keys: Array<{ key: string; value: string }>) =>
      apiFetch<UpdateConfigResponse>('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      }),
    onSuccess: async ({ updated }) => {
      await queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY })
      toast.success(`系统配置已保存，共更新 ${updated} 项`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存系统配置失败')
    },
  })

  const testWeChatMutation = useMutation({
    mutationFn: () => apiFetch<WeChatTestResponse>('/api/configs/test-wechat', { method: 'POST' }),
    onSuccess: () => toast.success('测试消息已发送，请检查当前管理员的企业微信'),
    onError: (error) => toast.error(error instanceof Error ? error.message : '测试消息发送失败'),
  })

  function handleSubmit(values: SettingsFormValues) {
    const keys = Object.entries(values)
      .filter(([key, value]) => value !== loadedValues[key as keyof SettingsFormValues])
      .map(([key, value]) => ({ key, value: value.trim() }))

    if (keys.length === 0) {
      toast.info('没有需要保存的更改')
      return
    }

    updateMutation.mutate(keys)
  }

  if (configsQuery.isLoading) {
    return <p className="py-10 text-sm text-muted-foreground">正在加载系统配置...</p>
  }

  if (configsQuery.isError) {
    const errorMessage = configsQuery.error instanceof Error ? configsQuery.error.message : '系统配置加载失败'
    return (
      <div className="space-y-4 py-10">
        <p className="text-sm text-destructive">{errorMessage}</p>
        {errorMessage !== '仅管理员可以管理系统配置' && (
          <Button onClick={() => configsQuery.refetch()} type="button" variant="outline">
            重新加载
          </Button>
        )}
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600">平台配置</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">系统设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理地图和企业微信服务配置</p>
      </div>

      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit(handleSubmit)}>
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <MapPinned aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <CardTitle>地图服务设置</CardTitle>
                  <CardDescription className="mt-1">用于高德地图定位和地址解析</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="amap_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>高德地图浏览器端密钥</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="请输入浏览器端密钥" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amap_security_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>高德安全密钥</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="请输入安全密钥" type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <KeyRound aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <CardTitle>企业微信设置</CardTitle>
                  <CardDescription className="mt-1">用于企业身份和应用消息服务</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="wechat_corp_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>企业标识</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="请输入企业标识" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wechat_corp_secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>企业微信应用密钥</FormLabel>
                    <FormControl><Input autoComplete="new-password" placeholder="请输入应用密钥" type="password" {...field} /></FormControl>
                    <FormDescription>已保存的应用密钥会以掩码显示，保留原值不会覆盖。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wechat_agent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>应用 Agent ID</FormLabel>
                    <FormControl><Input autoComplete="off" inputMode="numeric" placeholder="请输入应用 Agent ID" {...field} /></FormControl>
                    <FormDescription>用于向员工发送续费和任务提醒。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardContent className="border-t border-border pt-5">
              <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <p className="font-semibold">企业微信配置获取说明</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-5">
                  <li>打开<a className="mx-1 inline-flex items-center gap-1 font-medium underline" href="https://work.weixin.qq.com/" rel="noreferrer" target="_blank">企业微信管理后台<ExternalLink aria-hidden="true" className="size-3" /></a>，进入“我的企业”查看企业标识（Corp ID）。</li>
                  <li>进入“应用管理 → 自建应用”，打开本 CRM 应用，在“开发者接口凭证”中复制应用 Secret，并在应用详情顶部获取 Agent ID。</li>
                  <li>员工提醒使用的是企业微信成员 <strong>UserID</strong>，不是 CRM 数据库 UUID。进入“通讯录 → 成员”，打开成员详情，在“账号 / UserID”处复制；也可以在“员工管理 → 编辑员工”中直接从通讯录下拉选择。</li>
                  <li>员工管理弹窗会通过企业微信通讯录接口自动读取成员。若读取失败，请确认自建应用的可见范围覆盖成员，并拥有通讯录读取权限；管理员可在弹窗中手动填写 UserID。</li>
                  <li>如果通讯录接口仍无结果，在企业微信内打开员工编辑弹窗并点击“微信授权获取”。系统会通过网页授权接口读取当前登录成员的真实 UserID，不依赖通讯录全量读取权限；需在企业微信应用中配置网页授权域名为 <code className="break-all rounded bg-white px-1 py-0.5">serverless-crm-api.q84536346.workers.dev</code>。</li>
                  <li>如需域名验证，在“企业微信设置”中填写验证文件代码，并将文件原样上传到 API 根地址：<code className="break-all rounded bg-white px-1 py-0.5">https://serverless-crm-api.q84536346.workers.dev/WW_verify_验证代码.txt</code>，例如代码为 <code className="rounded bg-white px-1 py-0.5">123456</code> 时地址为 <code className="break-all rounded bg-white px-1 py-0.5">https://serverless-crm-api.q84536346.workers.dev/WW_verify_123456.txt</code>。</li>
                </ol>
                <p className="text-xs text-sky-800">保存配置后点击“发送测试消息”；若失败，请先确认应用已启用、可见范围包含该成员，且 UserID 与通讯录中的值完全一致。</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <CardTitle>企微域名验证</CardTitle>
                  <CardDescription className="mt-1">动态响应企业微信域名归属验证文件</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="ww_verify_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>验证文件代码</FormLabel>
                    <FormControl><Input autoComplete="off" className="max-w-md" placeholder="例如：123456" {...field} /></FormControl>
                    <FormDescription>如文件名为 WW_verify_123456.txt，此处只需填写 123456。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={testWeChatMutation.isPending || updateMutation.isPending} onClick={() => testWeChatMutation.mutate()} type="button" variant="outline">
              <Send aria-hidden="true" className="size-4" />
              {testWeChatMutation.isPending ? '正在发送' : '发送测试消息'}
            </Button>
            <Button disabled={updateMutation.isPending || testWeChatMutation.isPending} type="submit">
              <Save aria-hidden="true" className="size-4" />
              {updateMutation.isPending ? '正在保存' : '保存设置'}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  )
}
