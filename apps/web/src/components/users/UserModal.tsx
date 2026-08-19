// apps/web/src/components/users/UserModal.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InternalUser } from '@/hooks/useUsers'
import { apiFetch } from '@/lib/api'

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
  const isEditing = Boolean(user)

  useEffect(() => {
    if (!open) return
    setName(user?.name ?? '')
    setUsername(user?.username ?? '')
    setPinCode(isEditing ? '' : '123456')
    setRole(user?.role === 'admin' ? 'admin' : 'sales')
  }, [isEditing, open, user])

  const saveUser = useMutation({
    mutationFn: () => apiFetch(isEditing ? `/api/users/${user?.id}` : '/api/users', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        username: username.trim(),
        ...(pinCode ? { pin_code: pinCode } : {}),
        role,
        // 群机器人提醒不再使用 UserID；编辑现有员工时保留历史绑定值，避免误清空。
        wechat_userid: user?.wechatUserId ?? '',
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
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!canSubmit || saveUser.isPending} onClick={() => saveUser.mutate()} type="button">{saveUser.isPending ? '正在保存' : '保存员工'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
