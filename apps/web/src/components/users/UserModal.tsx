// apps/web/src/components/users/UserModal.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InternalUser } from '@/hooks/useUsers'
import { apiFetch } from '@/lib/api'

interface WeChatDirectoryUser {
  userid: string
  name: string
}

interface UserModalProps {
  user: InternalUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserModal({ user, open, onOpenChange }: UserModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pinCode, setPinCode] = useState('123456')
  const [role, setRole] = useState<'admin' | 'sales'>('sales')
  const [wechatUserId, setWechatUserId] = useState('')
  const [wechatOAuthPending, setWechatOAuthPending] = useState(false)
  const isEditing = Boolean(user)
  const wechatUsersQuery = useQuery({
    queryKey: ['wechat-users'],
    queryFn: () => apiFetch<{ users: WeChatDirectoryUser[] }>('/api/configs/wechat-users'),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    setName(user?.name ?? '')
    setUsername(user?.username ?? '')
    setPinCode(isEditing ? '' : '123456')
    setRole(user?.role === 'admin' ? 'admin' : 'sales')
    setWechatUserId(user?.wechatUserId ?? '')
  }, [isEditing, open, user])

  useEffect(() => {
    if (!open) return
    const handleOAuthMessage = (event: MessageEvent<{ userid?: string; name?: string; error?: string }>) => {
      if (event.origin !== window.location.origin) return
      setWechatOAuthPending(false)
      if (event.data?.userid) {
        setWechatUserId(event.data.userid)
        toast.success(`已获取企业微信 UserID：${event.data.name ?? event.data.userid}`)
      } else if (event.data?.error) {
        toast.error(event.data.error)
      }
    }
    window.addEventListener('message', handleOAuthMessage)
    return () => window.removeEventListener('message', handleOAuthMessage)
  }, [open])

  async function authorizeWeChatUser() {
    setWechatOAuthPending(true)
    try {
      const response = await apiFetch<{ authorizeUrl: string }>('/api/configs/wechat-oauth/start', { method: 'POST' })
      const popup = window.open(response.authorizeUrl, 'wechat-userid-oauth', 'popup,width=520,height=680')
      if (!popup) throw new Error('浏览器阻止了授权窗口，请允许弹出窗口后重试')
    } catch (error) {
      setWechatOAuthPending(false)
      toast.error(error instanceof Error ? error.message : '企业微信授权启动失败')
    }
  }

  const saveUser = useMutation({
    mutationFn: () => apiFetch(isEditing ? `/api/users/${user?.id}` : '/api/users', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        username: username.trim(),
        ...(pinCode ? { pin_code: pinCode } : {}),
        role,
        wechat_userid: wechatUserId.trim(),
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
      toast.success(isEditing ? '员工资料已更新' : '员工已创建')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '员工资料保存失败'),
  })

  const canSubmit = name.trim() && username.trim() && (isEditing || pinCode)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEditing ? '编辑员工' : '新建员工'}</DialogTitle><DialogDescription>企业微信 UserID 用于后续绑定企微扫码登录及接收续费提醒。</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="user-name">员工姓名</Label><Input autoFocus id="user-name" onChange={(event) => setName(event.target.value)} placeholder="请输入员工姓名" value={name} /></div>
          <div className="space-y-1.5"><Label htmlFor="user-username">登录账号 / 手机号</Label><Input id="user-username" onChange={(event) => setUsername(event.target.value)} placeholder="请输入登录账号或手机号" value={username} /></div>
          <div className="space-y-1.5"><Label htmlFor="user-pin">{isEditing ? '重置登录密码' : '初始登录密码'}</Label><Input id="user-pin" onChange={(event) => setPinCode(event.target.value)} placeholder={isEditing ? '留空则保持原密码' : '默认 123456'} type="password" value={pinCode} /></div>
          <div className="space-y-1.5"><Label htmlFor="user-role">系统角色</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="user-role" onChange={(event) => setRole(event.target.value as 'admin' | 'sales')} value={role}><option value="admin">系统管理员</option><option value="sales">普通销售</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="user-wechat-id">企业微信 UserID</Label><div className="flex gap-2"><select className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" id="user-wechat-id" onChange={(event) => setWechatUserId(event.target.value)} value={wechatUserId}><option value="">{wechatUsersQuery.isLoading ? '正在获取企业微信成员...' : '请选择通讯录成员'}</option>{wechatUsersQuery.data?.users.map((wechatUser) => <option key={wechatUser.userid} value={wechatUser.userid}>{wechatUser.name} · {wechatUser.userid}</option>)}</select><Button disabled={wechatOAuthPending} onClick={() => void authorizeWeChatUser()} type="button" variant="outline">{wechatOAuthPending ? '等待授权' : '微信授权获取'}</Button></div><Input aria-label="手动填写企业微信 UserID" onChange={(event) => setWechatUserId(event.target.value)} placeholder="也可手动填写，例如 zhangsan" value={wechatUserId} /><p className="text-xs text-muted-foreground">优先点击“微信授权获取”，在企业微信内确认后会自动回填真实 UserID；也可使用通讯录下拉或手动填写。</p></div>
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!canSubmit || saveUser.isPending} onClick={() => saveUser.mutate()} type="button">{saveUser.isPending ? '正在保存' : '保存员工'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
