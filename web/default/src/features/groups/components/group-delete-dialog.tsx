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
import { useState } from 'react'
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

import { deleteManagedGroup } from '../api'
import type { ManagedGroup } from '../types'

type GroupDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: ManagedGroup | null
}

export function GroupDeleteDialog(props: GroupDeleteDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [blocked, setBlocked] = useState(false)

  const group = props.group
  const hasReferences =
    blocked ||
    (group !== null &&
      (group.user_count > 0 ||
        group.channel_count > 0 ||
        group.token_count > 0))

  const mutation = useMutation({
    mutationFn: async (name: string) => deleteManagedGroup(name),
    onSuccess: (result) => {
      if (!result.success) {
        setBlocked(true)
        toast.error(result.message || t('Request failed'))
        queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
        return
      }
      toast.success(t('Group deleted successfully'))
      queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
      props.onOpenChange(false)
    },
    onError: () => {
      toast.error(t('Request failed'))
    },
  })

  const handleConfirm = () => {
    if (!group) return
    mutation.mutate(group.name)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) setBlocked(false)
    props.onOpenChange(open)
  }

  return (
    <AlertDialog open={props.open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete group')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Are you sure you want to delete group "{{name}}"?', {
              name: group?.name ?? '',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className='space-y-2 text-sm'>
          <p className='text-muted-foreground'>
            {t('Users')}: {group?.user_count ?? 0} · {t('Channels')}:{' '}
            {group?.channel_count ?? 0} · {t('Tokens')}:{' '}
            {group?.token_count ?? 0}
          </p>
          {hasReferences && (
            <p className='text-destructive'>
              {t(
                'This group is still referenced. Move its users, channels and tokens to another group before deleting it.'
              )}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              handleConfirm()
            }}
            disabled={hasReferences || mutation.isPending}
          >
            {mutation.isPending ? t('Deleting...') : t('Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
