// apps/web/src/components/customers/CustomerTagManager.tsx
import { Plus, Tag, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { customerDetailQueryKey } from '@/hooks/useCustomerDetail'
import { type CustomerTag, useCustomerTags } from '@/hooks/useCustomerTags'
import { apiFetch } from '@/lib/api'

interface CustomerTagManagerProps {
  customerId: string
  tags: CustomerTag[]
}

export function CustomerTagManager({ customerId, tags }: CustomerTagManagerProps) {
  const queryClient = useQueryClient()
  const [selectedTagId, setSelectedTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const tagsQuery = useCustomerTags()
  const selectedIds = tags.map((tag) => tag.id)
  const availableTags = (tagsQuery.data?.tags ?? []).filter((tag) => !selectedIds.includes(tag.id))

  const updateTags = useMutation({
    mutationFn: (tagIds: string[]) => apiFetch<{ tags: CustomerTag[] }>(`/api/customers/${customerId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_ids: tagIds }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '标签保存失败'),
  })
  const createTag = useMutation({
    mutationFn: (name: string) => apiFetch<{ tag: CustomerTag }>('/api/customers/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
    onSuccess: async ({ tag }) => {
      await queryClient.invalidateQueries({ queryKey: ['customer-tags'] })
      setNewTagName('')
      updateTags.mutate([...selectedIds, tag.id])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '新建标签失败'),
  })

  function addExistingTag() {
    if (!selectedTagId) return
    updateTags.mutate([...selectedIds, selectedTagId])
    setSelectedTagId('')
  }

  function createAndAddTag() {
    const name = newTagName.trim()
    if (!name) return
    createTag.mutate(name)
  }

  return <div className="border-t border-slate-100 pt-4">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Tag aria-hidden="true" className="size-3.5" />客户标签</p>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => <Badge className="gap-1 pr-1" key={tag.id} tone="info">{tag.name}<button aria-label={`移除标签 ${tag.name}`} className="rounded-sm p-0.5 hover:bg-sky-200" disabled={updateTags.isPending} onClick={() => updateTags.mutate(selectedIds.filter((id) => id !== tag.id))} type="button"><X aria-hidden="true" className="size-3" /></button></Badge>)}
      {tags.length === 0 && <span className="text-xs text-muted-foreground">暂无标签</span>}
    </div>
    {availableTags.length > 0 && <div className="mt-3 flex gap-2"><select aria-label="添加已有标签" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" onChange={(event) => setSelectedTagId(event.target.value)} value={selectedTagId}><option value="">选择已有标签</option>{availableTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><Button aria-label="添加标签" disabled={!selectedTagId || updateTags.isPending} onClick={addExistingTag} size="icon-sm" type="button" variant="outline"><Plus aria-hidden="true" /></Button></div>}
    <div className="mt-2 flex gap-2"><Input aria-label="新建客户标签" className="h-8 text-xs" maxLength={40} onChange={(event) => setNewTagName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createAndAddTag() } }} placeholder="新建标签，如：重点跟进" value={newTagName} /><Button disabled={!newTagName.trim() || createTag.isPending || updateTags.isPending} onClick={createAndAddTag} size="sm" type="button" variant="outline">{createTag.isPending ? '创建中' : '新建'}</Button></div>
  </div>
}
