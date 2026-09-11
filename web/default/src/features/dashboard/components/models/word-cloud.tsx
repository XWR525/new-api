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
import { VChart } from '@visactor/react-vchart'
import type { EventParamsDefinition } from '@visactor/vchart'
import { Cloud } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getChannelUsageTotals } from '@/features/dashboard/api'
import {
  buildQueryParams,
  buildWordCloudItems,
  getDefaultDays,
  WORD_CLOUD_TOP_LIMIT,
} from '@/features/dashboard/lib'
import { getDashboardChartColors } from '@/features/dashboard/lib/charts'
import type {
  DashboardFilters,
  QuotaDataItem,
  WordCloudDimension,
} from '@/features/dashboard/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatNumber } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { computeTimeRange } from '@/lib/time'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'
import { useAuthStore } from '@/stores/auth-store'

interface WordCloudProps {
  data: QuotaDataItem[]
  loading?: boolean
  filters?: DashboardFilters
}

const DIMENSION_OPTIONS: { value: WordCloudDimension; labelKey: string }[] = [
  { value: 'model', labelKey: 'By model' },
  { value: 'channel', labelKey: 'By channel' },
]

// 「其他」使用中性灰，避免与真实词条争夺视觉注意力
const OTHER_WORD_COLOR = '#94a3b8'

export function WordCloud(props: WordCloudProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const { copyToClipboard } = useCopyToClipboard()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const [dimension, setDimension] = useState<WordCloudDimension>('model')

  const timeRange = useMemo(
    () =>
      computeTimeRange(
        getDefaultDays(props.filters?.time_granularity),
        props.filters?.start_timestamp,
        props.filters?.end_timestamp
      ),
    [
      props.filters?.end_timestamp,
      props.filters?.start_timestamp,
      props.filters?.time_granularity,
    ]
  )
  const queryParams = useMemo(
    () => buildQueryParams(timeRange, props.filters),
    [props.filters, timeRange]
  )

  const channelQuery = useQuery({
    queryKey: ['dashboard', 'channel-usage', queryParams],
    queryFn: () => getChannelUsageTotals(queryParams),
    enabled: dimension === 'channel' && isAdmin,
    staleTime: 60_000,
    select: (res) => {
      if (!res?.success) {
        throw new Error(res?.message || t('Please try again later.'))
      }
      return res.data ?? []
    },
  })

  const activeDimension: WordCloudDimension =
    isAdmin && dimension === 'channel' ? 'channel' : 'model'
  const dimensionLoading =
    activeDimension === 'channel' ? channelQuery.isLoading : !!props.loading
  const dimensionError =
    activeDimension === 'channel' ? channelQuery.isError : false

  const wordCloud = useMemo(() => {
    const rows =
      activeDimension === 'channel'
        ? (channelQuery.data ?? []).map((row) => ({
            name: row.channel_name ?? '',
            value: Number(row.count) || 0,
          }))
        : props.data.map((row) => ({
            name: row.model_name ?? '',
            value: Number(row.count) || 0,
          }))

    const built = buildWordCloudItems(rows, { otherLabel: t('Other') })
    const palette = getDashboardChartColors(built.items.length)
    const items = built.items.map((item, index) => ({
      ...item,
      color: item.isAggregate
        ? OTHER_WORD_COLOR
        : (palette[index % Math.max(1, palette.length)] ?? OTHER_WORD_COLOR),
    }))

    return { ...built, items }
  }, [activeDimension, channelQuery.data, props.data, t])

  const spec = useMemo(
    () => ({
      type: 'wordCloud',
      data: [{ values: wordCloud.items }],
      nameField: 'name',
      valueField: 'value',
      colorHexField: 'color',
      fontSizeRange: [13, 40] as [number, number],
      fontWeightRange: [400, 700] as [number, number],
      rotateAngles: [0],
      word: {
        padding: 6,
        style: {
          cursor: activeDimension === 'model' ? 'pointer' : 'default',
        },
      },
      wordCloudConfig: {
        layoutMode: 'default',
        drawOutOfBound: 'hidden',
        zoomToFit: { shrink: true, enlarge: true },
      },
      tooltip: {
        mark: {
          title: { value: (datum: { name?: string }) => datum?.name ?? '' },
          content: [
            {
              key: t('Requests'),
              value: (datum: { value?: number }) =>
                formatNumber(Number(datum?.value) || 0),
            },
            {
              key: t('Share'),
              value: (datum: { share?: number }) =>
                `${((Number(datum?.share) || 0) * 100).toFixed(1)}%`,
            },
          ],
        },
      },
      animationAppear: { preset: 'fadeIn', duration: 300 },
    }),
    [activeDimension, t, wordCloud.items]
  )

  const handleChartClick = useCallback(
    (event: EventParamsDefinition['click']) => {
      if (activeDimension !== 'model') return

      const record = event as { datum?: unknown; item?: { datum?: unknown } }
      const candidates = [record?.datum, record?.item?.datum]
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue
        const datum = candidate as { name?: unknown; isAggregate?: unknown }
        const name = datum.name
        // 「其他」是聚合词条，不对应任何模型，不参与复制（按标记位判断，
        // 避免真实模型名恰好叫「其他」时被误判）
        if (typeof name === 'string' && name && datum.isAggregate !== true) {
          void copyToClipboard(name)
          return
        }
      }
    },
    [activeDimension, copyToClipboard]
  )

  const chartKey = [
    activeDimension,
    wordCloud.items.length,
    resolvedTheme,
  ].join('-')

  let chartContent = (
    <VChart
      key={chartKey}
      spec={{
        ...spec,
        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        background: 'transparent',
      }}
      option={VCHART_OPTION}
      onClick={handleChartClick}
    />
  )
  if (dimensionLoading) {
    chartContent = <Skeleton className='h-full w-full' />
  } else if (dimensionError) {
    const errorMessage =
      channelQuery.error instanceof Error
        ? channelQuery.error.message
        : t('Please try again later.')
    chartContent = (
      <div className='flex h-full items-center justify-center p-4'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertTitle>{t('Failed to load')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    )
  } else if (wordCloud.items.length === 0) {
    chartContent = (
      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
        {t('No data')}
      </div>
    )
  }

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex w-full flex-col gap-1.5 border-b px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex min-w-0 items-center gap-2'>
          <Cloud
            className='text-muted-foreground/60 size-4 shrink-0'
            aria-hidden='true'
          />
          <div className='text-sm font-semibold'>
            {t('Call Frequency Word Cloud')}
          </div>
          <span className='text-muted-foreground text-xs'>
            {t('Requests')}: {formatNumber(wordCloud.total)}
          </span>
          {wordCloud.truncated && (
            <span className='text-muted-foreground text-xs'>
              {t('Top {{count}}', { count: WORD_CLOUD_TOP_LIMIT })}
            </span>
          )}
        </div>

        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {isAdmin && (
            <div
              role='group'
              aria-label={t('Group by')}
              className='bg-muted/60 inline-flex h-7 w-full overflow-x-auto rounded-lg border p-0.5 sm:h-8 sm:w-auto'
            >
              {DIMENSION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type='button'
                  aria-pressed={activeDimension === option.value}
                  onClick={() => setDimension(option.value)}
                  className={`shrink-0 rounded-md px-3 text-xs font-medium transition-colors ${
                    activeDimension === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
        {themeReady && chartContent}
      </div>
    </div>
  )
}
