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
import { useQuery } from '@tanstack/react-query'
import { UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { searchUsers } from '@/features/users/api'
import { isUserDeleted } from '@/features/users/constants'
import type { User } from '@/features/users/types'

import { GroupAddUsersDialog } from './group-add-users-dialog'
import { GroupRemoveUsersDialog } from './group-remove-users-dialog'

const PAGE_SIZE = 20

type GroupUsersTableProps = {
  groupName: string
  builtin?: boolean
}

export function GroupUsersTable(props: GroupUsersTableProps) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<User | null>(null)
  const [page, setPage] = useState(1)
  const readOnly = props.builtin === true

  const usersQuery = useQuery({
    queryKey: ['group-users', props.groupName, page],
    queryFn: () =>
      searchUsers({ group: props.groupName, page_size: PAGE_SIZE, p: page }),
    staleTime: 30 * 1000,
  })

  const users = usersQuery.data?.data?.items ?? []
  const total = usersQuery.data?.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (usersQuery.isLoading) {
    return <Skeleton className='h-24 w-full rounded' />
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('Total: {{count}}', { count: total })}
        </p>
        {/* 内置 auto 分组不是真实分组，后端会拒绝所有写操作，故不提供入口 */}
        {!readOnly && (
          <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
            <UserPlus className='mr-2 h-4 w-4' />
            {t('Add users')}
          </Button>
        )}
      </div>

      {usersQuery.isError ? (
        <p className='text-muted-foreground text-sm'>{t('Failed to load')}</p>
      ) : (
        <StaticDataTable
          data={users}
          getRowKey={(user) => user.id}
          emptyContent={t('No users in this group')}
          columns={[
            {
              id: 'username',
              header: t('Username'),
              cellClassName: 'font-medium',
              cell: (user) => user.username,
            },
            {
              id: 'displayName',
              header: t('Display name'),
              cell: (user) => user.display_name || '—',
            },
            {
              id: 'group',
              header: t('Group name'),
              cellClassName: 'font-mono text-xs',
              cell: (user) => (
                <div className='flex flex-wrap items-center gap-1'>
                  <span>{user.group}</span>
                  {String(user.user_groups || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item !== '' && item !== user.group)
                    .map((item) => (
                      <Badge key={item} variant='outline' className='font-mono'>
                        {item}
                      </Badge>
                    ))}
                </div>
              ),
            },
            {
              id: 'status',
              header: t('Status'),
              cell: (user) => {
                if (isUserDeleted(user)) {
                  return <Badge variant='destructive'>{t('Deleted')}</Badge>
                }
                return (
                  <Badge variant={user.status === 1 ? 'secondary' : 'outline'}>
                    {user.status === 1 ? t('Enabled') : t('Disabled')}
                  </Badge>
                )
              },
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (user) => (
                <div className='flex justify-end'>
                  <Button
                    size='sm'
                    variant='ghost'
                    aria-label={t('Remove {{name}} from this group', {
                      name: user.username,
                    })}
                    disabled={readOnly}
                    onClick={() => setRemoveTarget(user)}
                  >
                    <UserMinus className='mr-2 h-4 w-4' aria-hidden='true' />
                    {t('Remove from group')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      {pageCount > 1 && (
        <div className='flex items-center justify-end gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            {t('Previous')}
          </Button>
          <span className='text-muted-foreground text-xs'>
            {t('Page {{page}} of {{total}}', { page, total: pageCount })}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={page >= pageCount}
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
          >
            {t('Next')}
          </Button>
        </div>
      )}

      {!readOnly && (
        <>
          <GroupAddUsersDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            groupName={props.groupName}
          />
          <GroupRemoveUsersDialog
            open={removeTarget !== null}
            onOpenChange={(open) => {
              if (!open) setRemoveTarget(null)
            }}
            groupName={props.groupName}
            user={removeTarget}
          />
        </>
      )}
    </div>
  )
}
