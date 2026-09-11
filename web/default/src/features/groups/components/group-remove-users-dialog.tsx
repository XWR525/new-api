/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { User } from '@/features/users/types'

import { getManagedGroups, removeManagedGroupUsers } from '../api'

type GroupRemoveUsersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  user: User | null
}

export function GroupRemoveUsersDialog(props: GroupRemoveUsersDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [targetGroup, setTargetGroup] = useState('')
  const [syncTokens, setSyncTokens] = useState(true)

  const groupsQuery = useQuery({
    queryKey: ['managed-groups'],
    queryFn: getManagedGroups,
    enabled: props.open,
    staleTime: 30 * 1000,
  })
  const groups = groupsQuery.data?.data
  // 候选列表必须保持引用稳定：每次渲染都新建数组会让下面的 effect 每次渲染都执行，
  // 把用户刚选好的目标分组与"同步令牌分组"勾选状态重置回默认值。
  const candidates = useMemo(
    () =>
      (groups ?? []).filter(
        (group) => !group.builtin && group.name !== props.groupName
      ),
    [groups, props.groupName]
  )

  useEffect(() => {
    if (!props.open) return
    // 目标分组取候选首项：不再硬编码 'default'（该分组可能已被删除或不在候选内，
    // 那样下拉框会没有匹配项且提交必然失败）。
    setTargetGroup(candidates[0]?.name ?? '')
    setSyncTokens(true)
  }, [props.open, candidates])

  const mutation = useMutation({
    mutationFn: () => {
      if (!props.user) throw new Error('no user selected')
      return removeManagedGroupUsers(props.groupName, {
        user_ids: [props.user.id],
        target_group: targetGroup,
        sync_tokens: syncTokens,
      })
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message || t('Request failed'))
        return
      }
      toast.success(
        t('{{count}} users updated', { count: result.data?.affected ?? 0 })
      )
      queryClient.invalidateQueries({
        queryKey: ['managed-group', props.groupName],
      })
      queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
      queryClient.invalidateQueries({
        queryKey: ['group-users', props.groupName],
      })
      props.onOpenChange(false)
    },
    onError: () => {
      toast.error(t('Request failed'))
    },
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Remove user from group')}
      description={t(
        'Are you sure you want to remove {{name}} from this group?',
        { name: props.user?.username ?? '' }
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={mutation.isPending || targetGroup === ''}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('Saving...') : t('Remove from group')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='space-y-2'>
          <Label>{t('Move to')}</Label>
          <Select
            value={targetGroup}
            onValueChange={(value) => setTargetGroup(value ?? '')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((group) => (
                <SelectItem key={group.name} value={group.name}>
                  {group.display_name} ({group.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {t(
              "If this is the user's primary group it becomes the target group; otherwise the group is only removed from their additional groups."
            )}
          </p>
        </div>

        <label className='flex cursor-pointer items-start gap-2 rounded-lg border p-3'>
          <Checkbox
            checked={syncTokens}
            onCheckedChange={(checked) => setSyncTokens(checked === true)}
          />
          <span className='space-y-0.5'>
            <span className='block text-sm font-medium'>
              {t('Sync token groups')}
            </span>
            <span className='text-muted-foreground block text-xs'>
              {t(
                "Clear the group of these users' tokens so they follow the user group. Token groups take precedence over the user group."
              )}
            </span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}
