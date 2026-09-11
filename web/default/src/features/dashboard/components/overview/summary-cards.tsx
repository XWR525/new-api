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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaggerContainer, StaggerItem } from '@/components/page-transition'
import {
  getUserQuotaDates,
  getUsageSummary,
} from '@/features/dashboard/api'
import { useSummaryCardsConfig } from '@/features/dashboard/hooks/use-dashboard-config'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { formatNumber, formatQuota } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { computeTimeRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import { StatCard } from '../ui/stat-card'

const SUMMARY_SPARKLINE_BUCKETS = 12

type SummarySparklineKey = 'usage' | 'requests'

function getBucketIndex(
  timestamp: number,
  start: number,
  end: number,
  bucketCount: number
): number {
  if (end <= start) return 0
  const ratio = (timestamp - start) / (end - start)
  return Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)))
}

function buildSummarySparklines(
  data: QuotaDataItem[],
  start: number,
  end: number
): Record<SummarySparklineKey, number[]> {
  const usage = Array.from({ length: SUMMARY_SPARKLINE_BUCKETS }, () => 0)
  const requests = Array.from({ length: SUMMARY_SPARKLINE_BUCKETS }, () => 0)

  for (const item of data) {
    const timestamp = Number(item.created_at) || start
    const index = getBucketIndex(
      timestamp,
      start,
      end,
      SUMMARY_SPARKLINE_BUCKETS
    )
    usage[index] += Number(item.quota) || 0
    requests[index] += Number(item.count) || 0
  }

  return { usage, requests }
}

function getSummarySparkline(
  key: string,
  sparklineData: Record<SummarySparklineKey, number[]>
): number[] | undefined {
  if (key === 'usage') return sparklineData.usage
  if (key === 'requests') return sparklineData.requests
  return undefined
}

export function SummaryCards() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { loading } = useStatus()
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const summaryTimeRange = useMemo(() => computeTimeRange(1), [])

  const usageTrendQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-sparklines',
      isAdmin ? 'all-users' : 'self',
      summaryTimeRange.start_timestamp,
      summaryTimeRange.end_timestamp,
    ],
    queryFn: async () =>
      getUserQuotaDates(
        {
          start_timestamp: summaryTimeRange.start_timestamp,
          end_timestamp: summaryTimeRange.end_timestamp,
          default_time: 'hour',
        },
        isAdmin
      ),
    staleTime: 60 * 1000,
  })

  // 管理员概览统计所有用户的数据；普通用户仍统计自身数据
  const usageSummaryQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'usage-summary'],
    queryFn: getUsageSummary,
    enabled: isAdmin,
    staleTime: 60 * 1000,
    select: (res) => {
      if (!res?.success) return undefined
      return res.data
    },
  })

  const usedQuota = isAdmin
    ? (usageSummaryQuery.data?.used_quota ?? 0)
    : Number(user?.used_quota ?? 0)
  const requestCount = isAdmin
    ? (usageSummaryQuery.data?.request_count ?? 0)
    : Number(user?.request_count ?? 0)

  const summaryValues = useMemo(() => {
    return {
      usedDisplay: formatQuota(usedQuota),
      requestCountDisplay: formatNumber(requestCount),
    }
  }, [requestCount, usedQuota])

  const sparklineData = useMemo(
    () =>
      buildSummarySparklines(
        usageTrendQuery.data?.data ?? [],
        summaryTimeRange.start_timestamp,
        summaryTimeRange.end_timestamp
      ),
    [
      summaryTimeRange.end_timestamp,
      summaryTimeRange.start_timestamp,
      usageTrendQuery.data?.data,
    ]
  )

  const recentUsage = useMemo(
    () =>
      (usageTrendQuery.data?.data ?? []).reduce(
        (total, item) => total + (Number(item.quota) || 0),
        0
      ),
    [usageTrendQuery.data?.data]
  )

  const todayUsageDisplay = formatQuota(recentUsage)

  const items = useSummaryCardsConfig({
    ...summaryValues,
    todayUsageDisplay,
    currencyEnabled: false,
    currencyLabel: 'Tokens',
  }).map((config, index) => {
    const tones = ['rose', 'teal', 'gray'] as const

    return {
      key: config.key,
      title: config.title,
      value: config.value,
      desc: config.description,
      icon: config.icon,
      tone: tones[index] ?? 'gray',
      sparkline:
        config.key === 'todayUsage'
          ? sparklineData.usage
          : getSummarySparkline(config.key, sparklineData),
      sparklineVariant: 'line' as const,
    }
  })

  return (
    <div className='bg-card overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex flex-col gap-3 p-4 sm:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex flex-col gap-1'>
            <h3 className='text-base font-semibold'>
              {t('Usage at a glance')}
            </h3>
            <p className='text-muted-foreground text-sm'>
              {t('Monitor token usage and request volume')}
            </p>
          </div>
        </div>
        <StaggerContainer className='grid gap-3 md:grid-cols-3'>
          {items.map((it) => (
            <StaggerItem
              key={it.key}
              className='bg-background/60 rounded-xl border p-3'
            >
              <StatCard
                title={it.title}
                value={it.value}
                description={it.desc}
                icon={it.icon}
                tone={it.tone}
                sparkline={it.sparkline}
                sparklineVariant={it.sparklineVariant}
                loading={loading || (isAdmin && usageSummaryQuery.isLoading)}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </div>
  )
}
