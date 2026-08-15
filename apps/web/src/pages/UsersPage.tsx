// apps/web/src/pages/UsersPage.tsx
import { format } from 'date-fns'
import { Pencil, Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserModal } from '@/components/users/UserModal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type InternalUser, useUsers } from '@/hooks/useUsers'
import { getUserRoleLabel } from '@/lib/presentation'

export default function UsersPage() {
  const usersQuery = useUsers()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null)

  if (usersQuery.isLoading) return <p className="py-10 text-sm text-muted-foreground">正在加载员工列表...</p>
  if (usersQuery.isError) return <p className="py-10 text-sm text-destructive">{usersQuery.error instanceof Error ? usersQuery.error.message : '员工列表加载失败'}</p>

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">员工管理</h1><p className="mt-1 text-sm text-muted-foreground">管理系统登录账号、角色权限及企业微信绑定信息。</p></div><Button onClick={() => setCreateOpen(true)} type="button"><Plus aria-hidden="true" />新建员工</Button></div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card"><Table><TableHeader><TableRow><TableHead>员工姓名</TableHead><TableHead>登录账号</TableHead><TableHead>系统角色</TableHead><TableHead>企业微信 UserID</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
        {usersQuery.data?.users.map((user) => <TableRow key={user.id}><TableCell className="font-medium">{user.name}</TableCell><TableCell>{user.username ?? user.id}</TableCell><TableCell>{getUserRoleLabel(user.role)}</TableCell><TableCell>{user.wechatUserId ?? '未绑定'}</TableCell><TableCell>{user.createdAt ? format(new Date(user.createdAt), 'yyyy-MM-dd HH:mm') : '历史账号'}</TableCell><TableCell className="text-right"><Button aria-label={`编辑${user.name}`} onClick={() => setEditingUser(user)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></TableCell></TableRow>)}
        {usersQuery.data?.users.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>暂无员工</TableCell></TableRow>}
      </TableBody></Table></div>
      <UserModal onOpenChange={setCreateOpen} open={createOpen} user={null} />
      <UserModal onOpenChange={(open) => !open && setEditingUser(null)} open={Boolean(editingUser)} user={editingUser} />
    </section>
  )
}
