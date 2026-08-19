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
  wechat_group_webhook: string
  wecom_bot_id: string
  wecom_bot_secret: string
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
  wechat_group_webhook: '',
  wecom_bot_id: '',
  wecom_bot_secret: '',
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
    wechat_group_webhook: values.wechat_group_webhook ?? '',
    wecom_bot_id: values.wecom_bot_id ?? '',
    wecom_bot_secret: values.wecom_bot_secret ?? '',
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
                  <CardTitle>企业微信提醒</CardTitle>
                  <CardDescription className="mt-1">续费和任务提醒统一发送到内部群，不需要固定可信 IP</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="wecom_bot_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>智能机器人 BotID</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="在企业微信智能机器人后台复制 BotID" {...field} /></FormControl>
                    <FormDescription>企业微信后台：智能机器人 → API 模式 → 长连接。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wecom_bot_secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>长连接专用 Secret</FormLabel>
                    <FormControl><Input autoComplete="new-password" placeholder="首次填写或输入新 Secret 更新" type="password" {...field} /></FormControl>
                    <FormDescription>保存后仅显示掩码；保持原值无需改动。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wechat_group_webhook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>群消息推送 Webhook 地址（备用）</FormLabel>
                    <FormControl><Input autoComplete="new-password" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." type="password" {...field} /></FormControl>
                    <FormDescription>未启用智能机器人网关时使用。该地址包含消息推送机器人的唯一密钥，会以掩码显示；留空不会覆盖已保存的地址。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardContent className="border-t border-border pt-5">
              <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <p className="font-semibold">推荐：智能机器人长连接</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-5">
                  <li>管理员在企业微信后台创建“智能机器人”，开启“API 模式 → 长连接”，将 BotID 和长连接专用 Secret 填入上方并保存。</li>
                  <li>将 CRM 智能机器人加入目标内部群，在群内 @机器人发送任意消息，系统会自动绑定该提醒群。</li>
                  <li>点击“发送测试消息”，确认群内收到消息后，续费和任务提醒将优先通过智能机器人发送。</li>
                  <li>智能机器人不依赖企业可信 IP。员工单独提醒前，员工必须先与机器人发起过会话。</li>
                </ol>
                <p className="text-xs text-sky-800">备用方式：在内部群设置中选择“消息推送 → 添加机器人”，将生成的 Webhook 地址填入上方。智能机器人未配置时，系统会使用此备用地址。</p>
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
              {testWeChatMutation.isPending ? '正在发送' : '发送群测试消息'}
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
