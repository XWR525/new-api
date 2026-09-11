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
import { ChevronRight, CircleAlert, Copy } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import type { PricingModel, TokenUnit } from '../types'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: () => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  perf?: ModelPerfBadgeData
  /** 已登录用户：当前分组完全无法使用该模型 */
  unavailable?: boolean
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const initial = props.model.model_name?.charAt(0).toUpperCase() || '?'

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(props.model.model_name || '')
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border p-3 transition-colors sm:p-5',
        'hover:bg-muted/20'
      )}
    >
      {/* Header: icon + model name + copy */}
      <div className='flex items-start gap-2.5 sm:gap-3'>
        <div className='bg-muted/40 flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10 sm:rounded-xl'>
          {modelIcon || (
            <span className='text-muted-foreground text-sm font-bold'>
              {initial}
            </span>
          )}
        </div>
        <h3 className='text-foreground min-w-0 flex-1 break-all font-mono text-[15px] leading-tight font-bold'>
          {props.model.model_name}
        </h3>
        {/* 标记与复制按钮同处一行并垂直居中，保证两者中心水平对齐 */}
        <div className='flex shrink-0 items-center gap-2.5 sm:gap-3'>
          {props.unavailable && (
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      role='img'
                      tabIndex={0}
                      aria-label={t('Your group cannot use this model yet')}
                      className='flex cursor-help items-center rounded-full text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 dark:text-amber-400'
                    />
                  }
                >
                  <CircleAlert className='size-4' />
                </TooltipTrigger>
                <TooltipContent side='top'>
                  {t('Your group cannot use this model yet')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <button
            type='button'
            onClick={handleCopy}
            className='text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-md border p-1.5 transition-colors'
            title={t('Copy')}
          >
            <Copy className='size-3.5' />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className='text-muted-foreground mt-2 line-clamp-1 flex-1 text-[13px] leading-relaxed sm:mt-4 sm:line-clamp-2 sm:min-h-[2.5rem]'>
        {props.model.description || t('No description available.')}
      </p>

      {/* Bottom-right actions */}
      <div className='mt-3 flex items-center justify-end gap-1.5 sm:mt-4'>
        <ModelPerfBadge perf={props.perf} className='mr-auto' />
        <button
          type='button'
          onClick={props.onClick}
          className='text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors sm:px-2.5 sm:py-1.5'
        >
          {t('Details')}
          <ChevronRight className='size-3.5' />
        </button>
      </div>
    </div>
  )
})
