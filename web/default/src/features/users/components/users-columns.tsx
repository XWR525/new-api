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
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { BadgeCell } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { LongText } from '@/components/long-text'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatQuota, formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  USER_STATUS,
  USER_STATUSES,
  USER_ROLES,
  isUserDeleted,
} from '../constants'
import type { ActiveSubscriptionSummary, User } from '../types'
import { DataTableRowActions } from './data-table-row-actions'

function getQuotaProgressColor(percentage: number): string {
  if (percentage <= 10) return '[&_[data-slot=progress-indicator]]:bg-rose-500'
  if (percentage <= 30) return '[&_[data-slot=progress-indicator]]:bg-amber-500'
  return '[&_[data-slot=progress-indicator]]:bg-emerald-500'
}

/** 订阅周期额度：完整千分位金额（不做 k 缩写），配合"￥0/￥2,000"样式 */
function formatCycleQuotaAmount(quota: number): string {
  return formatQuotaWithCurrency(quota, {
    digitsLarge: 0,
    digitsSmall: 2,
    abbreviate: false,
  })
}

function getCycleQuotaCellText(
  sub: ActiveSubscriptionSummary,
  t: (key: string) => string
): string {
  const usedText = formatCycleQuotaAmount(sub.amount_used)
  const totalText =
    sub.amount_total > 0
      ? formatCycleQuotaAmount(sub.amount_total)
      : t('Unlimited')
  return `${sub.plan_title || t('Subscription')}(${usedText}/${totalText})`
}

export function useUsersColumns(): ColumnDef<User>[] {
  const { t } = useTranslation()
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: 'id',
      header: t('ID'),
      cell: ({ row }) => {
        return (
          <TableId value={row.getValue('id') as number} className='w-[60px]' />
        )
      },
      size: 80,
      meta: { mobileHidden: true },
    },
    {
      accessorKey: 'username',
      header: t('Username'),
      cell: ({ row }) => {
        const username = row.getValue('username') as string
        const displayName = row.original.display_name
        const remark = row.original.remark

        return (
          <div className='flex min-w-[160px] flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <LongText className='max-w-[140px] font-medium'>
                {username}
              </LongText>
              {remark && (
                <Tooltip>
                  <TooltipTrigger
                    render={<StatusBadge variant='success' copyable={false} />}
                  >
                    <LongText className='max-w-[80px]'>{remark}</LongText>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className='text-xs'>{remark}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {displayName && displayName !== username && (
              <LongText className='text-muted-foreground max-w-[180px] text-xs'>
                {displayName}
              </LongText>
            )}
          </div>
        )
      },
      enableHiding: false,
      size: 220,
      meta: { mobileTitle: true },
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => {
        const user = row.original
        const requestCount = user.request_count

        const statusConfig = isUserDeleted(user)
          ? USER_STATUSES[USER_STATUS.DELETED]
          : USER_STATUSES[user.status as keyof typeof USER_STATUSES]

        if (!statusConfig) {
          return null
        }

        return (
          <Tooltip>
            <TooltipTrigger render={<div className='-ml-1.5 cursor-help' />}>
              <StatusBadge
                label={t(statusConfig.labelKey)}
                variant={statusConfig.variant}
                copyable={false}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className='text-xs'>
                {t('Requests:')} {requestCount.toLocaleString()}
              </p>
            </TooltipContent>
          </Tooltip>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(String(row.getValue(id)))
      },
      enableSorting: false,
      size: 120,
      meta: { mobileBadge: true },
    },
    {
      id: 'quota',
      accessorKey: 'quota',
      header: t('Quota'),
      cell: ({ row }) => {
        const user = row.original
        const used = user.used_quota
        const remaining = user.quota
        // 总额只统计钱包口径消耗（wallet_used_quota）：订阅承担的消耗不计入，
        // 否则"余额 + used_quota"会随订阅消耗虚增（订阅消耗单独显示在提示中）。
        const walletUsed = user.wallet_used_quota ?? 0
        const subscriptionUsed = Math.max(used - walletUsed, 0)
        const total = remaining + walletUsed
        const percentage = total > 0 ? (remaining / total) * 100 : 0

        if (total === 0) {
          return (
            <StatusBadge
              label={t('No Quota')}
              variant='neutral'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }

        return (
          <Tooltip>
            <TooltipTrigger
              render={<div className='w-[150px] cursor-help space-y-1' />}
            >
              <div className='flex justify-between text-xs'>
                <span className='font-medium tabular-nums'>
                  {formatQuota(remaining)}
                </span>
                <span className='text-muted-foreground tabular-nums'>
                  {formatQuota(total)}
                </span>
              </div>
              <Progress
                value={percentage}
                className={cn('h-1.5', getQuotaProgressColor(percentage))}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className='max-w-xs space-y-1 text-xs'>
                <div>
                  {t('Balance')}: {formatQuota(remaining)}
                </div>
                <div>
                  {t('Wallet spending')}: {formatQuota(walletUsed)}
                </div>
                <div>
                  {t('Subscription spending')}: {formatQuota(subscriptionUsed)}
                </div>
                <div className='text-muted-foreground'>
                  {t(
                    'Total counts wallet spending only; subscription usage is not included.'
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
      size: 170,
    },
    {
      id: 'cycle_quota',
      accessorKey: 'active_subscriptions',
      header: t('Cycle Quota'),
      cell: ({ row }) => {
        const subs = row.original.active_subscriptions
        if (!subs || subs.length === 0) {
          return (
            <span className='text-muted-foreground text-sm'>
              {t('No Subscription')}
            </span>
          )
        }
        const primary = subs[0]
        // 与「额度」列保持同一形式：左为剩余、右为总额，进度条表示剩余占比（蓝色）
        const used = primary.amount_used
        const total = primary.amount_total
        const remaining = total > 0 ? Math.max(total - used, 0) : 0
        const percentage = total > 0 ? (remaining / total) * 100 : 0
        return (
          <Tooltip>
            <TooltipTrigger
              render={<div className='w-[150px] cursor-help space-y-1' />}
            >
              {total > 0 ? (
                <>
                  <div className='flex justify-between text-xs'>
                    <span className='font-medium tabular-nums'>
                      {formatCycleQuotaAmount(remaining)}
                    </span>
                    <span className='text-muted-foreground tabular-nums'>
                      {formatCycleQuotaAmount(total)}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    className='h-1.5 [&_[data-slot=progress-indicator]]:bg-blue-500'
                  />
                </>
              ) : (
                <span className='text-muted-foreground text-sm'>
                  {t('Unlimited')}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <div className='space-y-1.5 text-xs'>
                {subs.map((sub) => {
                  const usedPct =
                    sub.amount_total > 0
                      ? Math.min(
                          100,
                          (sub.amount_used / sub.amount_total) * 100
                        )
                      : 0
                  return (
                    <div
                      key={`${sub.plan_title}|${sub.amount_total}|${sub.next_reset_time}`}
                      className='border-border/60 border-t pt-1.5 first:border-t-0 first:pt-0'
                    >
                      <div className='font-medium'>
                        {sub.plan_title || t('Subscription')}
                      </div>
                      <div>{getCycleQuotaCellText(sub, t)}</div>
                      <div>
                        {t('Reset at:')}{' '}
                        {sub.next_reset_time > 0
                          ? formatTimestamp(sub.next_reset_time)
                          : t('No Reset')}
                      </div>
                      {usedPct >= 100 && sub.amount_total > 0 && (
                        <div className='text-rose-400'>
                          {t('Quota exhausted')}
                        </div>
                      )}
                    </div>
                  )
                })}
                {subs.length > 1 && (
                  <div className='text-muted-foreground'>
                    {t('+{{count}} more', { count: subs.length - 1 })}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
      enableSorting: false,
      size: 170,
    },
    {
      accessorKey: 'group',
      header: t('Group'),
      cell: ({ row }) => {
        const group = row.getValue('group') as string
        const additionalGroups = String(row.original.user_groups || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '' && item !== group)
        return (
          <BadgeCell>
            <GroupBadge group={group} />
            {additionalGroups.map((item) => (
              <GroupBadge key={item} group={item} />
            ))}
          </BadgeCell>
        )
      },
      filterFn: (row, id, value) => {
        const primary = String(row.getValue(id) || t('User Group'))
        const all = [primary, row.original.user_groups || '']
          .join(',')
          .toLowerCase()
        const searchValue = String(value).toLowerCase()
        return all.includes(searchValue)
      },
      size: 140,
    },
    {
      accessorKey: 'role',
      header: t('Role'),
      cell: ({ row }) => {
        const roleValue = row.getValue('role') as number
        const roleConfig = USER_ROLES[roleValue as keyof typeof USER_ROLES]

        if (!roleConfig) {
          return null
        }

        return (
          <div className='flex items-center gap-x-2'>
            {roleConfig.icon && (
              <roleConfig.icon size={16} className='text-muted-foreground' />
            )}
            <span className='text-sm'>{t(roleConfig.labelKey)}</span>
          </div>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(String(row.getValue(id)))
      },
      enableSorting: false,
      size: 120,
    },
    {
      accessorKey: 'created_at',
      header: t('Created At'),
      cell: ({ row }) => {
        const ts = row.getValue('created_at') as number | undefined
        return (
          <span className='text-muted-foreground text-sm'>
            {ts ? formatTimestamp(ts) : '-'}
          </span>
        )
      },
      size: 180,
      meta: { mobileHidden: true },
    },
    {
      accessorKey: 'last_login_at',
      header: t('Last Login'),
      cell: ({ row }) => {
        const ts = row.getValue('last_login_at') as number | undefined
        return (
          <span className='text-muted-foreground text-sm'>
            {ts ? formatTimestamp(ts) : '-'}
          </span>
        )
      },
      size: 180,
      meta: { mobileHidden: true },
    },
    {
      id: 'actions',
      header: () => t('Actions'),
      cell: ({ row }) => <DataTableRowActions row={row} />,
      meta: { pinned: 'right' as const },
    },
  ]
}
