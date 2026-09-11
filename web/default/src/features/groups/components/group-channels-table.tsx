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
import { TagIcon, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getChannels } from '@/features/channels/api'
import type { Channel } from '@/features/channels/types'

import { GroupAddChannelsDialog } from './group-add-channels-dialog'
import { GroupRemoveChannelsDialog } from './group-remove-channels-dialog'

type GroupChannelsTableProps = {
  groupName: string
  builtin?: boolean
}

const PAGE_SIZE = 20

export function GroupChannelsTable(props: GroupChannelsTableProps) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Channel | null>(null)
  const [page, setPage] = useState(1)
  const readOnly = props.builtin === true

  const channelsQuery = useQuery({
    queryKey: ['group-channels', props.groupName, page],
    queryFn: () =>
      getChannels({ group: props.groupName, page_size: PAGE_SIZE, p: page }),
    staleTime: 30 * 1000,
  })

  const channels = channelsQuery.data?.data?.items ?? []
  const total = channelsQuery.data?.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (channelsQuery.isLoading) {
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
            <TagIcon className='mr-2 h-4 w-4' />
            {t('Add channels')}
          </Button>
        )}
      </div>

      {channelsQuery.isError ? (
        <p className='text-muted-foreground text-sm'>{t('Failed to load')}</p>
      ) : (
        <StaticDataTable
          data={channels}
          getRowKey={(channel) => channel.id}
          emptyContent={t('No channels tagged with this group')}
          columns={[
            {
              id: 'name',
              header: t('Name'),
              cellClassName: 'font-medium',
              cell: (channel) => channel.name,
            },
            {
              id: 'status',
              header: t('Status'),
              cell: (channel) => (
                <Badge variant={channel.status === 1 ? 'secondary' : 'outline'}>
                  {channel.status === 1 ? t('Enabled') : t('Disabled')}
                </Badge>
              ),
            },
            {
              id: 'group',
              header: t('Group name'),
              cellClassName: 'font-mono text-xs',
              cell: (channel) => channel.group,
            },
            {
              id: 'models',
              header: t('Models'),
              cellClassName: 'text-muted-foreground max-w-xs truncate text-xs',
              cell: (channel) => channel.models || '—',
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (channel) => (
                <div className='flex justify-end'>
                  <Button
                    size='sm'
                    variant='ghost'
                    aria-label={t('Remove {{name}} from this group', {
                      name: channel.name,
                    })}
                    disabled={readOnly}
                    onClick={() => setRemoveTarget(channel)}
                  >
                    <X className='mr-2 h-4 w-4' aria-hidden='true' />
                    {t('Remove group tag')}
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
          <GroupAddChannelsDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            groupName={props.groupName}
          />
          <GroupRemoveChannelsDialog
            open={removeTarget !== null}
            onOpenChange={(open) => {
              if (!open) setRemoveTarget(null)
            }}
            groupName={props.groupName}
            channel={removeTarget}
          />
        </>
      )}
    </div>
  )
}
