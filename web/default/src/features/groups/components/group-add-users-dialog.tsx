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
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { searchUsers } from '@/features/users/api'
import { isUserDeleted } from '@/features/users/constants'
import type { User } from '@/features/users/types'

import { addManagedGroupUsers } from '../api'

type GroupAddUsersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
}

// 该用户是否已属于此分组：直接按行数据判断，而不是依赖成员表当前页的 ID 集合
// （超出当前页的既有成员会被误显示为可选）。
function isUserInGroup(user: User, groupName: string): boolean {
  if (user.group === groupName) {
    return true
  }
  return String(user.user_groups || '')
    .split(',')
    .some((item) => item.trim() === groupName)
}

export function GroupAddUsersDialog(props: GroupAddUsersDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [syncTokens, setSyncTokens] = useState(true)

  useEffect(() => {
    if (!props.open) return
    setKeyword('')
    setSelected([])
    setSyncTokens(true)
  }, [props.open])

  const usersQuery = useQuery({
    queryKey: ['group-user-picker', keyword],
    queryFn: () => searchUsers({ keyword, page_size: 50, p: 1 }),
    enabled: props.open,
    staleTime: 10 * 1000,
  })
  const users = usersQuery.data?.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () =>
      addManagedGroupUsers(props.groupName, {
        user_ids: selected,
        sync_tokens: syncTokens,
      }),
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

  const toggleUser = (userId: number, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, userId] : prev.filter((id) => id !== userId)
    )
  }

  // 加载/失败/列表三态用 if-else 表达，避免嵌套三元（前端规范禁止）。
  let pickerContent: ReactNode
  if (usersQuery.isLoading) {
    pickerContent = <Skeleton className='h-32 w-full rounded' />
  } else if (usersQuery.isError) {
    pickerContent = (
      <p className='text-muted-foreground text-sm'>{t('Failed to load')}</p>
    )
  } else {
    pickerContent = (
      <div className='max-h-64 space-y-1 overflow-y-auto'>
        {users.map((user) => {
          const isMember = isUserInGroup(user, props.groupName)
          const isDeleted = isUserDeleted(user)
          return (
            <label
              key={user.id}
              className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5'
            >
              <Checkbox
                checked={selected.includes(user.id)}
                disabled={isMember || isDeleted}
                onCheckedChange={(checked) =>
                  toggleUser(user.id, checked === true)
                }
              />
              <span className='font-medium'>{user.username}</span>
              {user.display_name && (
                <span className='text-muted-foreground text-xs'>
                  {user.display_name}
                </span>
              )}
              {isMember && (
                <Badge variant='outline' className='ml-auto'>
                  {t('Already in this group')}
                </Badge>
              )}
              {isDeleted && (
                <Badge variant='destructive' className='ml-auto'>
                  {t('Deleted')}
                </Badge>
              )}
            </label>
          )
        })}
        {users.length === 0 && (
          <p className='text-muted-foreground text-sm'>{t('No users found')}</p>
        )}
      </div>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Add users to group')}
      description={t(
        'Selected users are added to this group as an additional group; their primary group stays unchanged.'
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
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? t('Saving...')
              : t('Add {{count}} users', { count: selected.length })}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t('Search users')}
          aria-label={t('Search users')}
        />

        {pickerContent}

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
