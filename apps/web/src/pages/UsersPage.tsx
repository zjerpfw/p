// apps/web/src/pages/UsersPage.tsx
import { format } from 'date-fns'
import { Pencil, Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { UserModal } from '@/components/users/UserModal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type InternalUser, useUsers } from '@/hooks/useUsers'
import { getUserRoleLabel } from '@/lib/presentation'

import { useIsMobile } from '@/hooks/use-mobile'

export default function UsersPage() {
  const isMobile = useIsMobile()
  const usersQuery = useUsers()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null)

  if (usersQuery.isLoading) return <p className="py-10 text-center text-xs text-muted-foreground">正在加载员工列表...</p>
  if (usersQuery.isError) return <p className="py-10 text-center text-xs text-destructive">{usersQuery.error instanceof Error ? usersQuery.error.message : '员工列表加载失败'}</p>

  return (
    <section className="space-y-3.5 md:space-y-6 pb-8">
      {/* 桌面端大标题 */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600">组织与权限</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">员工管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理系统登录账号、角色权限及企业微信绑定信息。</p>
        </div>
        <Button className="shadow-sm shadow-indigo-200" onClick={() => setCreateOpen(true)} type="button">
          <Plus aria-hidden="true" />
          新建员工
        </Button>
      </div>

      {/* 移动端顶栏 */}
      <div className="flex md:hidden items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">共 {usersQuery.data?.users.length ?? 0} 位团队成员</span>
        <Button className="h-8 px-3 text-xs bg-indigo-600 font-medium text-white shadow-sm active:scale-95" onClick={() => setCreateOpen(true)} size="sm" type="button">
          <Plus aria-hidden="true" className="size-3.5" />
          新建员工
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-2.5">
          {usersQuery.data?.users.map((user) => (
            <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm active:bg-slate-50 transition-colors" key={user.id}>
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-indigo-100 font-bold text-xs text-indigo-700">
                      {user.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="font-bold text-sm text-slate-900 leading-none">{user.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">账号: {user.username ?? user.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={user.role === 'admin' ? 'default' : 'info'} className="text-[10px]">
                      {getUserRoleLabel(user.role)}
                    </Badge>
                    <Button aria-label={`编辑${user.name}`} onClick={() => setEditingUser(user)} size="icon-xs" type="button" variant="ghost">
                      <Pencil aria-hidden="true" className="size-3.5 text-slate-400" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-muted-foreground">
                  <span>企微: {user.wechatUserId ? <span className="text-emerald-700 font-medium">{user.wechatUserId}</span> : '未绑定'}</span>
                  <span>{user.createdAt ? format(new Date(user.createdAt), 'yyyy-MM-dd') : '系统初始'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {usersQuery.data?.users.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">暂无员工</p>
          )}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><input aria-label="选择全部员工" className="size-4 rounded border-slate-300" type="checkbox" /></TableHead>
                  <TableHead>员工姓名</TableHead>
                  <TableHead>登录账号</TableHead>
                  <TableHead>系统角色</TableHead>
                  <TableHead>企业微信 UserID</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data?.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell><input aria-label={`选择员工 ${user.name}`} className="size-4 rounded border-slate-300" type="checkbox" /></TableCell>
                    <TableCell className="font-semibold text-slate-800">{user.name}</TableCell>
                    <TableCell className="text-slate-600">{user.username ?? user.id}</TableCell>
                    <TableCell><Badge tone={user.role === 'admin' ? 'default' : 'info'}>{getUserRoleLabel(user.role)}</Badge></TableCell>
                    <TableCell className="text-slate-600">{user.wechatUserId ?? '未绑定'}</TableCell>
                    <TableCell className="text-slate-600">{user.createdAt ? format(new Date(user.createdAt), 'yyyy-MM-dd HH:mm') : '历史账号'}</TableCell>
                    <TableCell className="text-right"><Button aria-label={`编辑${user.name}`} onClick={() => setEditingUser(user)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></TableCell>
                  </TableRow>
                ))}
                {usersQuery.data?.users.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无员工</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <UserModal onOpenChange={setCreateOpen} open={createOpen} user={null} />
      <UserModal onOpenChange={(open) => !open && setEditingUser(null)} open={Boolean(editingUser)} user={editingUser} />
    </section>
  )
}
