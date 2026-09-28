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
import { Cloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getChannelUsageTotals } from '@/features/dashboard/api'
import {
  buildMaskGridFromCoverage,
  buildQueryParams,
  buildWordCloudItems,
  createLayoutSeed,
  createSeededRandom,
  getDefaultDays,
  layoutWordCloudInMask,
  WORD_CLOUD_TOP_LIMIT,
  type PlacedWordCloudWord,
  type WordCloudMaskGrid,
  type WordCloudSprite,
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

// 遮罩文字：词条被排布进「A I」字形，形成 ASCII art 式的整体轮廓。
// 两个字分开绘制，中间留出字距（MASK_LETTER_GAP_RATIO），避免挨在一起看不清
const MASK_LETTERS = ['A', 'I'] as const
const WORD_CLOUD_MASK_TEXT = MASK_LETTERS.join('')
/** 字距相对字号的倍率：越大两个字分得越开 */
const MASK_LETTER_GAP_RATIO = 0.38
// 遮罩与字形共用的采样网格边长（像素）：越小越精确，布局越慢
const MASK_CELL_SIZE = 4
const WORD_FONT_STACK =
  'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
const WORD_FONT_WEIGHT = 700
// 遮罩用更重的字重：笔画更粗 → 能容纳更多词条，外形轮廓也更清晰
const MASK_FONT_WEIGHT = 900
// 主词（按调用量排名）与重复填充词条的字号范围
const KEYWORD_FONT_SIZE_RANGE = [16, 48] as const
const FILL_FONT_SIZE_RANGE = [9, 30] as const
// 字号硬下限：9px 是实测后选定的档位（更小开始难以辨认；放宽到 9px 能多铺约 8% 面积）
const MIN_FONT_SIZE = 9
// 重复填充轮数：同一模型会在字形中出现多次；轮数越多、笔画里塞得越满
const FILL_ROUNDS = 24
// 允许的旋转角度：0° 保留 3 个权重以偏重水平；±15/±75 这类中间角度能让词条
// 顺着「A」的斜笔画整块嵌进去，在同样的越界约束下铺得更满
const WORD_ANGLES = [
  0, 0, 0, -15, 15, -30, 30, -45, 45, -60, 60, -75, 75, 90,
] as const
// 每个字号最多尝试几个不同角度：抽得越多越容易找到能整体放进笔画的方向
const ANGLES_PER_SIZE = 6
// 目标覆盖率：几乎填满笔画才停（靠轮次与锚点预算提密度，不靠越界）
const TARGET_COVERAGE = 0.97
// 单阶段锚点搜索预算：越大越容易找到零散小空隙，密度越高
const MAX_ANCHORS_PER_WORD = 1500
// 允许字形越出遮罩的格子比例（收紧）
const OVERFLOW_RATIO = 0.04
// 越界格子数的绝对上限：长模型名按比例算会越出十几格、直接戳破轮廓，
// 因此用一个很小的绝对值兜住（布局会优先尝试"完全不越界"的位置）
const MAX_OVERFLOW_CELLS = 1
// 遮罩外扩格子数：词条要求完全在字形内会啃掉笔画边缘一圈，外扩 1 格（4px）即可贴边填满，
// 视觉上看不出来，但密度明显提升
const MASK_DILATE_CELLS = 1

interface WordCloudGlyphs {
  grid: WordCloudMaskGrid
  buildSprite: (
    text: string,
    fontSize: number,
    angle: number
  ) => WordCloudSprite
}

/**
 * 构建词云所需的两种栅格数据：
 * ① 把「AI」画到离屏 canvas 并按网格采样成遮罩（决定词条的分布形状）；
 * ② 把单个词条按其字号与旋转角度光栅化成"字形格子"，供布局做像素级避让。
 * 两者共用同一字体设置，保证布局估算与 SVG 实际渲染一致。
 */
function createWordCloudGlyphs(
  width: number,
  height: number
): WordCloudGlyphs | null {
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskContext = maskCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!maskContext) return null

  maskContext.fillStyle = '#ffffff'
  maskContext.fillRect(0, 0, width, height)
  maskContext.fillStyle = '#000000'
  maskContext.textAlign = 'left'
  maskContext.textBaseline = 'middle'

  const setMaskFont = (fontSize: number) => {
    maskContext.font = `${MASK_FONT_WEIGHT} ${fontSize}px ${WORD_FONT_STACK}`
  }
  const measureMask = (text: string, fontSize: number) => {
    setMaskFont(fontSize)
    return maskContext.measureText(text).width
  }
  // 两个字分开绘制并显式留出间距（整串 "AI" 只能拿到字体自带的窄字距）
  const letterGap = (fontSize: number) =>
    Math.round(fontSize * MASK_LETTER_GAP_RATIO)
  const pairWidth = (fontSize: number) =>
    measureMask(MASK_LETTERS[0], fontSize) +
    letterGap(fontSize) +
    measureMask(MASK_LETTERS[1], fontSize)

  // 字号先撑满高度，若「A I」整体超出画布再按比例收缩（字距同步缩放）
  let maskFontSize = Math.max(24, Math.floor(height * 0.94))
  const maxMaskWidth = width * 0.92
  const pairFullWidth = pairWidth(maskFontSize)
  if (pairFullWidth > maxMaskWidth) {
    maskFontSize = Math.max(
      24,
      Math.floor((maskFontSize * maxMaskWidth) / pairFullWidth)
    )
  }
  setMaskFont(maskFontSize)
  const firstLetterWidth = measureMask(MASK_LETTERS[0], maskFontSize)
  const gap = letterGap(maskFontSize)
  const pairWidthFinal =
    firstLetterWidth + gap + measureMask(MASK_LETTERS[1], maskFontSize)
  const startX = Math.max(0, (width - pairWidthFinal) / 2)
  setMaskFont(maskFontSize)
  maskContext.fillText(MASK_LETTERS[0], startX, height / 2)
  maskContext.fillText(
    MASK_LETTERS[1],
    startX + firstLetterWidth + gap,
    height / 2
  )

  const maskPixels = maskContext.getImageData(0, 0, width, height).data
  const grid = buildMaskGridFromCoverage(
    // 白底黑字：亮度越低越"属于字形"
    (x, y) => 255 - maskPixels[(y * width + x) * 4],
    { width, height, cellSize: MASK_CELL_SIZE, dilateCells: MASK_DILATE_CELLS }
  )

  const spriteCanvas = document.createElement('canvas')
  const spriteContext = spriteCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!spriteContext) return null
  const spriteFont = (fontSize: number) =>
    `${WORD_FONT_WEIGHT} ${fontSize}px ${WORD_FONT_STACK}`

  const buildSprite = (
    text: string,
    fontSize: number,
    angle: number
  ): WordCloudSprite => {
    spriteContext.font = spriteFont(fontSize)
    const textWidth = Math.max(spriteContext.measureText(text).width, 1)
    const lineHeight = fontSize * 1.2
    const radians = (angle * Math.PI) / 180
    const cos = Math.abs(Math.cos(radians))
    const sin = Math.abs(Math.sin(radians))
    const boxWidth =
      Math.ceil(cos * textWidth + sin * lineHeight) + MASK_CELL_SIZE * 2
    const boxHeight =
      Math.ceil(sin * textWidth + cos * lineHeight) + MASK_CELL_SIZE * 2

    // 调整画布尺寸会重置上下文状态，因此随后重新设置字体与对齐
    spriteCanvas.width = boxWidth
    spriteCanvas.height = boxHeight
    spriteContext.font = spriteFont(fontSize)
    spriteContext.textAlign = 'center'
    spriteContext.textBaseline = 'middle'
    spriteContext.fillStyle = '#000000'
    spriteContext.save()
    spriteContext.translate(boxWidth / 2, boxHeight / 2)
    spriteContext.rotate(radians)
    spriteContext.fillText(text, 0, 0)
    spriteContext.restore()

    const pixels = spriteContext.getImageData(0, 0, boxWidth, boxHeight).data
    const cols = Math.max(1, Math.ceil(boxWidth / MASK_CELL_SIZE))
    const rows = Math.max(1, Math.ceil(boxHeight / MASK_CELL_SIZE))
    const cells = new Uint8Array(cols * rows)
    const sampleOffsets = [0.15, 0.5, 0.85]
    for (let gy = 0; gy < rows; gy += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        let filled = 0
        for (const oy of sampleOffsets) {
          for (const ox of sampleOffsets) {
            const px = Math.min(
              boxWidth - 1,
              Math.floor(gx * MASK_CELL_SIZE + ox * MASK_CELL_SIZE)
            )
            const py = Math.min(
              boxHeight - 1,
              Math.floor(gy * MASK_CELL_SIZE + oy * MASK_CELL_SIZE)
            )
            if (pixels[(py * boxWidth + px) * 4 + 3] > 96) {
              filled = 1
              break
            }
          }
          if (filled === 1) break
        }
        cells[gy * cols + gx] = filled
      }
    }

    return { cols, rows, cells }
  }

  return { grid, buildSprite }
}

export function WordCloud(props: WordCloudProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const [dimension, setDimension] = useState<WordCloudDimension>('model')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [hovered, setHovered] = useState<{
    word: PlacedWordCloudWord
    x: number
    y: number
  } | null>(null)

  // 容器尺寸变化时需要重新布局（遮罩字形大小取决于可用面积）
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const width = Math.floor(element.clientWidth)
      const height = Math.floor(element.clientHeight)
      setCanvasSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

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

  const placedWords = useMemo(() => {
    if (!canvasSize || canvasSize.width < 80 || canvasSize.height < 60) {
      return []
    }
    if (wordCloud.items.length === 0) return []
    const glyphs = createWordCloudGlyphs(canvasSize.width, canvasSize.height)
    if (!glyphs) return []

    const result = layoutWordCloudInMask({
      items: wordCloud.items,
      mask: glyphs.grid,
      buildSprite: glyphs.buildSprite,
      fontSizeRange: KEYWORD_FONT_SIZE_RANGE,
      repeatRounds: FILL_ROUNDS,
      fillFontSizeRange: FILL_FONT_SIZE_RANGE,
      angles: WORD_ANGLES,
      anglesPerSize: ANGLES_PER_SIZE,
      targetCoverage: TARGET_COVERAGE,
      overflowRatio: OVERFLOW_RATIO,
      maxOverflowCells: MAX_OVERFLOW_CELLS,
      maxAnchorsPerWord: MAX_ANCHORS_PER_WORD,
      minFontSize: MIN_FONT_SIZE,
      // 固定种子：同一份数据与尺寸得到稳定排布，不会因重渲染而抖动
      random: createSeededRandom(
        createLayoutSeed(wordCloud.items, canvasSize.width, canvasSize.height)
      ),
    })

    return result.words
  }, [canvasSize, wordCloud.items])

  const handleWordClick = useCallback(
    (word: PlacedWordCloudWord) => {
      if (activeDimension !== 'model') return
      // 「其他」是聚合词条，不对应任何模型，不参与复制
      if (word.isAggregate) return
      void copyToClipboard(word.name)
    },
    [activeDimension, copyToClipboard]
  )

  const handleWordEnter = useCallback((word: PlacedWordCloudWord) => {
    setHovered({ word, x: word.x, y: word.y })
  }, [])

  // 悬浮卡片定位：贴着词条，并避免超出画布右边界
  const tooltipLeft = hovered
    ? Math.min(hovered.x + 10, Math.max(0, (canvasSize?.width ?? 0) - 160))
    : 0
  const tooltipTop = hovered ? Math.max(0, hovered.y - 8) : 0

  let chartContent: React.ReactNode
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
  } else if (wordCloud.items.length === 0 || placedWords.length === 0) {
    chartContent = (
      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
        {t('No data')}
      </div>
    )
  } else {
    chartContent = (
      <>
        <svg
          className='block h-full w-full'
          role='img'
          aria-label={`${t('Call Frequency Word Cloud')} (${WORD_CLOUD_MASK_TEXT})`}
        >
          {placedWords.map((word) => (
            <text
              key={`${word.name}-${word.round}-${word.x.toFixed(1)}-${word.y.toFixed(1)}`}
              transform={`translate(${word.x.toFixed(1)} ${word.y.toFixed(1)}) rotate(${word.angle})`}
              textAnchor='middle'
              dominantBaseline='central'
              fontSize={word.fontSize}
              fontWeight={WORD_FONT_WEIGHT}
              fill={word.color}
              fillOpacity={word.round === 0 ? 1 : 0.82}
              style={{
                cursor:
                  activeDimension === 'model' && !word.isAggregate
                    ? 'pointer'
                    : 'default',
              }}
              onClick={() => handleWordClick(word)}
              onMouseEnter={() => handleWordEnter(word)}
              onMouseLeave={() => setHovered(null)}
            >
              {word.name}
            </text>
          ))}
        </svg>
        {hovered && (
          <div
            className='bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border px-2 py-1 shadow-md'
            style={{
              left: tooltipLeft,
              top: tooltipTop,
            }}
          >
            <div className='text-xs font-medium'>{hovered.word.name}</div>
            <div className='text-muted-foreground text-xs'>
              {t('Requests')}: {formatNumber(hovered.word.value)}
            </div>
            <div className='text-muted-foreground text-xs'>
              {t('Share')}: {((hovered.word.share || 0) * 100).toFixed(1)}%
            </div>
          </div>
        )}
      </>
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

      <div className='h-[340px] p-1.5 sm:h-[26rem] sm:p-2'>
        <div ref={containerRef} className='relative h-full w-full'>
          {chartContent}
        </div>
      </div>
    </div>
  )
}
