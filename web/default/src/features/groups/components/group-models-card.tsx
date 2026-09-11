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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { updateManagedGroupWhitelist } from '../api'

type GroupModelsCardProps = {
  groupName: string
  models: string[]
  whitelist: string[]
  builtin: boolean
}

function parsePatterns(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

export function GroupModelsCard(props: GroupModelsCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(props.whitelist.join('\n'))

  useEffect(() => {
    setDraft(props.whitelist.join('\n'))
  }, [props.whitelist])

  const patterns = parsePatterns(draft)
  const dirty = patterns.join(',') !== props.whitelist.join(',')

  const mutation = useMutation({
    mutationFn: async () =>
      updateManagedGroupWhitelist(props.groupName, patterns),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message || t('Request failed'))
        return
      }
      toast.success(t('Model whitelist updated'))
      queryClient.invalidateQueries({
        queryKey: ['managed-group', props.groupName],
      })
      queryClient.invalidateQueries({ queryKey: ['managed-groups'] })
    },
    onError: () => {
      toast.error(t('Request failed'))
    },
  })

  return (
    <div className='space-y-4'>
      <div>
        <p className='text-muted-foreground mb-2 text-xs'>
          {t('Models available to this group (from channel abilities)')}
        </p>
        {props.models.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('No models available. Tag a channel with this group first.')}
          </p>
        ) : (
          <div className='flex max-h-48 flex-wrap gap-1.5 overflow-y-auto'>
            {props.models.map((modelName) => (
              <Badge key={modelName} variant='outline' className='font-mono'>
                {modelName}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className='space-y-2'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Model whitelist. Leave empty for no restriction. Supports * wildcards such as glm-* or *-flash.'
          )}
        </p>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={'glm-*\ndeepseek-chat'}
          disabled={props.builtin}
          rows={4}
          className='font-mono text-sm'
        />
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            disabled={props.builtin || !dirty || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('Saving...') : t('Save')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={props.builtin || !dirty || mutation.isPending}
            onClick={() => setDraft(props.whitelist.join('\n'))}
          >
            {t('Reset')}
          </Button>
          {props.builtin && (
            <span className='text-muted-foreground text-xs'>
              {t('Built-in groups cannot be edited')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
