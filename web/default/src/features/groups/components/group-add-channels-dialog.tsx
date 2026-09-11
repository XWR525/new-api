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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getChannels } from '@/features/channels/api'

import { addManagedGroupChannels } from '../api'

type GroupAddChannelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
}

export function GroupAddChannelsDialog(props: GroupAddChannelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<number[]>([])

  useEffect(() => {
    if (!props.open) return
    setKeyword('')
    setSelected([])
  }, [props.open])

  const channelsQuery = useQuery({
    queryKey: ['group-channel-picker'],
    queryFn: () => getChannels({ p: 1, page_size: 100 }),
    enabled: props.open,
    staleTime: 10 * 1000,
  })

  const channels = useMemo(() => {
    const items = channelsQuery.data?.data?.items ?? []
    const lowered = keyword.trim().toLowerCase()
    if (!lowered) return items
    return items.filter((channel) =>
      channel.name.toLowerCase().includes(lowered)
    )
  }, [channelsQuery.data, keyword])

  const mutation = useMutation({
    mutationFn: () =>
      addManagedGroupChannels(props.groupName, { channel_ids: selected }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message || t('Request failed'))
        return
      }
      toast.success(
        t('{{count}} channels updated', { count: result.data?.affected ?? 0 })
      )
      queryClient.invalidateQueries({
        queryKey: ['managed-group', props.groupName],
      })
      queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
      queryClient.invalidateQueries({
        queryKey: ['group-channels', props.groupName],
      })
      props.onOpenChange(false)
    },
    onError: () => {
      toast.error(t('Request failed'))
    },
  })

  const toggleChannel = (channelId: number, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, channelId] : prev.filter((id) => id !== channelId)
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Add channels to group')}
      description={t(
        'The group tag is appended to the selected channels; their other groups are kept.'
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
              : t('Add {{count}} channels', { count: selected.length })}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t('Search channels')}
        />

        {channelsQuery.isLoading ? (
          <Skeleton className='h-32 w-full rounded' />
        ) : (
          <div className='max-h-64 space-y-1 overflow-y-auto'>
            {channels.map((channel) => {
              const groups = channel.group
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item !== '')
              const isMember = groups.includes(props.groupName)
              return (
                <label
                  key={channel.id}
                  className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5'
                >
                  <Checkbox
                    checked={selected.includes(channel.id)}
                    disabled={isMember}
                    onCheckedChange={(checked) =>
                      toggleChannel(channel.id, checked === true)
                    }
                  />
                  <span className='font-medium'>{channel.name}</span>
                  <span className='text-muted-foreground font-mono text-xs'>
                    {channel.group || '—'}
                  </span>
                  {isMember && (
                    <Badge variant='outline' className='ml-auto'>
                      {t('Already in this group')}
                    </Badge>
                  )}
                </label>
              )
            })}
            {channels.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {t('No channels found')}
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
