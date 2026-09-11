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
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { getManagedGroups } from '../api'
import type { ManagedGroup } from '../types'

type GroupsTableProps = {
  onEdit: (group: ManagedGroup) => void
  onDelete: (group: ManagedGroup) => void
}

export function GroupsTable(props: GroupsTableProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const groupsQuery = useQuery({
    queryKey: ['managed-groups'],
    queryFn: getManagedGroups,
    staleTime: 30 * 1000,
  })

  const groups = groupsQuery.data?.data ?? []

  if (groupsQuery.isLoading) {
    return (
      <div className='space-y-2'>
        {[0, 1, 2].map((slot) => (
          <Skeleton key={slot} className='h-10 w-full rounded' />
        ))}
      </div>
    )
  }

  // 请求失败时不要渲染成"暂无分组"，那会误导管理员以为数据为空。
  if (groupsQuery.isError) {
    return (
      <p className='text-muted-foreground text-sm'>{t('Failed to load')}</p>
    )
  }

  return (
    <StaticDataTable
      data={groups}
      getRowKey={(group) => group.name}
      emptyContent={t('No groups found. Create one to get started.')}
      columns={[
        {
          id: 'name',
          header: t('Group name'),
          cellClassName: 'font-mono text-sm',
          cell: (group) => (
            <div className='flex items-center gap-2'>
              <Button
                variant='link'
                className='h-auto p-0 font-mono text-sm'
                onClick={() =>
                  navigate({
                    to: '/groups/$groupName',
                    params: { groupName: group.name },
                  })
                }
              >
                {group.name}
              </Button>
              {group.builtin && (
                <Badge variant='secondary'>{t('Built-in')}</Badge>
              )}
              {group.auto_group && !group.builtin && (
                <Badge variant='outline'>{t('Auto')}</Badge>
              )}
            </div>
          ),
        },
        {
          id: 'displayName',
          header: t('Display name'),
          cell: (group) => group.display_name,
        },
        {
          id: 'users',
          header: t('Users'),
          cellClassName: 'tabular-nums',
          cell: (group) => group.user_count,
        },
        {
          id: 'channels',
          header: t('Channels'),
          cellClassName: 'tabular-nums',
          cell: (group) => group.channel_count,
        },
        {
          id: 'models',
          header: t('Models'),
          cellClassName: 'tabular-nums',
          cell: (group) => group.model_count,
        },
        {
          id: 'whitelist',
          header: t('Model whitelist'),
          cellClassName: 'text-muted-foreground max-w-xs truncate text-xs',
          cell: (group) =>
            group.whitelist.length === 0
              ? t('Unrestricted')
              : group.whitelist.join(', '),
        },
        {
          id: 'actions',
          header: t('Actions'),
          className: 'text-right pr-[26px]',
          cell: (group) => (
            <StaticRowActions
              editLabel={t('Edit')}
              deleteLabel={t('Delete')}
              menuLabel={t('Open menu')}
              editDisabled={group.builtin}
              deleteDisabled={group.builtin}
              onEdit={() => props.onEdit(group)}
              onDelete={() => props.onDelete(group)}
            />
          ),
        },
      ]}
    />
  )
}
