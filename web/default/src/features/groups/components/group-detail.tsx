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
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { getManagedGroupDetail } from '../api'
import { GroupChannelsTable } from './group-channels-table'
import { GroupModelsCard } from './group-models-card'
import { GroupUsersTable } from './group-users-table'

type GroupDetailProps = {
  groupName: string
}

function OverviewItem(props: { label: string; value: React.ReactNode }) {
  return (
    <div className='bg-muted/40 rounded-lg px-3 py-2'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-0.5 text-sm font-medium'>{props.value}</div>
    </div>
  )
}

export function GroupDetail(props: GroupDetailProps) {
  const { t } = useTranslation()
  const detailQuery = useQuery({
    queryKey: ['managed-group', props.groupName],
    queryFn: () => getManagedGroupDetail(props.groupName),
    staleTime: 30 * 1000,
  })

  const detail = detailQuery.data?.data

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Group detail')}: {props.groupName}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' size='sm' render={<Link to='/groups' />}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back to list')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {detailQuery.isLoading && (
          <div className='space-y-2'>
            {[0, 1, 2].map((slot) => (
              <Skeleton key={slot} className='h-16 w-full rounded' />
            ))}
          </div>
        )}

        {detailQuery.isError && (
          <p className='text-muted-foreground text-sm'>{t('Failed to load')}</p>
        )}

        {!detailQuery.isLoading && !detailQuery.isError && !detail && (
          <p className='text-muted-foreground text-sm'>
            {t('Group not found')}
          </p>
        )}

        {detail && (
          <div className='space-y-6'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-lg font-semibold'>
                {detail.name}
              </span>
              <Badge variant='secondary'>{detail.display_name}</Badge>
              {detail.builtin && (
                <Badge variant='outline'>{t('Built-in')}</Badge>
              )}
              {detail.auto_group && (
                <Badge variant='outline'>{t('Auto')}</Badge>
              )}
            </div>

            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <OverviewItem label={t('Users')} value={detail.user_count} />
              <OverviewItem
                label={t('Channels')}
                value={detail.channel_count}
              />
              <OverviewItem label={t('Tokens')} value={detail.token_count} />
              <OverviewItem label={t('Models')} value={detail.model_count} />
              <OverviewItem
                label={t('Model whitelist')}
                value={
                  detail.whitelist.length === 0
                    ? t('Unrestricted')
                    : detail.whitelist.join(', ')
                }
              />
            </div>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>{t('Users')}</h3>
              <GroupUsersTable
                groupName={detail.name}
                builtin={detail.builtin}
              />
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>{t('Channels')}</h3>
              <GroupChannelsTable
                groupName={detail.name}
                builtin={detail.builtin}
              />
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('Models and whitelist')}
              </h3>
              <GroupModelsCard
                groupName={detail.name}
                models={detail.models ?? []}
                whitelist={detail.whitelist ?? []}
                builtin={detail.builtin}
              />
            </section>
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
