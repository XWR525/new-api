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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Channel } from '@/features/channels/types'

import { removeManagedGroupChannels } from '../api'

type GroupRemoveChannelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  channel: Channel | null
}

export function GroupRemoveChannelsDialog(
  props: GroupRemoveChannelsDialogProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      if (!props.channel) throw new Error('no channel selected')
      return removeManagedGroupChannels(props.groupName, {
        channel_ids: [props.channel.id],
      })
    },
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

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Remove group tag')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Are you sure you want to remove this group tag from {{name}}? The channel will no longer serve this group, and its abilities are rebuilt.',
              { name: props.channel?.name ?? '' }
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              mutation.mutate()
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('Saving...') : t('Remove group tag')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
