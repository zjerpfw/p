// apps/web/src/pages/SettingsPage.tsx
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MapPinned, Save, ShieldCheck } from 'lucide-react'
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

const defaultValues: SettingsFormValues = {
  amap_key: '',
  amap_security_code: '',
  wechat_corp_id: '',
  wechat_corp_secret: '',
  ww_verify_code: '',
}

function toFormValues(configs: ConfigItem[]): SettingsFormValues {
  const values = Object.fromEntries(configs.map(({ key, value }) => [key, value]))
  return {
    amap_key: values.amap_key ?? '',
    amap_security_code: values.amap_security_code ?? '',
    wechat_corp_id: values.wechat_corp_id ?? '',
    wechat_corp_secret: values.wechat_corp_secret ?? '',
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
    return (
      <div className="space-y-4 py-10">
        <p className="text-sm text-destructive">
          {configsQuery.error instanceof Error ? configsQuery.error.message : '系统配置加载失败'}
        </p>
        <Button onClick={() => configsQuery.refetch()} type="button" variant="outline">
          重新加载
        </Button>
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系统设置</h1>
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
                    <FormLabel>高德地图 Web Key</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="请输入 Web Key" {...field} /></FormControl>
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
                    <FormLabel>Corp ID</FormLabel>
                    <FormControl><Input autoComplete="off" placeholder="请输入企业 ID" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wechat_corp_secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Corp Secret</FormLabel>
                    <FormControl><Input autoComplete="new-password" placeholder="请输入应用 Secret" type="password" {...field} /></FormControl>
                    <FormDescription>已保存的 Secret 会以掩码显示，留原值不会覆盖。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

          <div className="flex justify-end">
            <Button disabled={updateMutation.isPending} type="submit">
              <Save aria-hidden="true" className="size-4" />
              {updateMutation.isPending ? '正在保存' : '保存设置'}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  )
}
