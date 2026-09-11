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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import { createManagedGroup, updateManagedGroup } from '../api'
import type { ManagedGroup } from '../types'

const schema = z.object({
  name: z
    .string()
    .min(1, { message: 'Group name is required' })
    .max(32, { message: 'Group name must be 32 characters or fewer' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message:
        'Group name can only contain letters, numbers, underscores and hyphens',
    }),
  displayName: z
    .string()
    .max(50, { message: 'Display name must be 50 characters or fewer' }),
})

type GroupFormValues = z.output<typeof schema>
type GroupFormInput = z.input<typeof schema>

type GroupMutateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: ManagedGroup | null
}

export function GroupMutateDialog(props: GroupMutateDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = props.group !== null

  const form = useForm<GroupFormInput, unknown, GroupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      displayName: '',
    },
  })

  useEffect(() => {
    if (!props.open) return
    if (props.group) {
      form.reset({
        name: props.group.name,
        displayName: props.group.display_name,
      })
      return
    }
    form.reset({ name: '', displayName: '' })
  }, [form, props.open, props.group])

  const mutation = useMutation({
    mutationFn: async (values: GroupFormValues) => {
      if (editing) {
        return updateManagedGroup(props.group?.name ?? '', {
          display_name: values.displayName,
        })
      }
      return createManagedGroup({
        name: values.name,
        display_name: values.displayName,
      })
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message || t('Request failed'))
        return
      }
      toast.success(
        editing
          ? t('Group updated successfully')
          : t('Group created successfully')
      )
      queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
      if (editing) {
        queryClient.invalidateQueries({
          queryKey: ['managed-group', props.group?.name],
        })
      }
      props.onOpenChange(false)
    },
    onError: () => {
      toast.error(t('Request failed'))
    },
  })

  const onSubmit = (values: GroupFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? t('Edit group') : t('Create group')}
      description={
        editing
          ? t('Update the display name of this group.')
          : t('Create a new user group and open it for selection.')
      }
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
            type='submit'
            form='group-mutate-form'
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='group-mutate-form'
          className='space-y-4'
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group name')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={editing}
                    placeholder={t('e.g. team-a')}
                    autoComplete='off'
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Letters, numbers, underscores and hyphens only. The name cannot be changed later.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='displayName'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Display name')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('Shown in group selectors')}
                    autoComplete='off'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
