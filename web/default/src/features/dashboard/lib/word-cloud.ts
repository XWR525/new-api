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
// ----------------------------------------------------------------------------
// Dashboard Word Cloud Data
// ----------------------------------------------------------------------------

/** 词云最多单独展示的词条数，超出的合并为「其他」。 */
export const WORD_CLOUD_TOP_LIMIT = 30

export interface WordCloudEntry {
  name: string
  value: number
}

export interface WordCloudItem extends WordCloudEntry {
  /** 占总调用次数的比例，取值 0~1 */
  share: number
  /**
   * 是否为「其他」聚合项。
   * 组件据此判断灰色与不可复制，而不是比较名称——真实模型/渠道名可能就叫
   * 「其他」（或英文 Other），按名称比较会把真实词条误判为聚合项。
   */
  isAggregate?: boolean
}

export interface WordCloudData {
  items: WordCloudItem[]
  /** 全部词条的调用次数之和（包含被合并进「其他」的部分） */
  total: number
  /** 被合并进「其他」的词条数量 */
  mergedCount: number
  /** 是否发生了 Top N 截断 */
  truncated: boolean
}

/**
 * 把原始调用记录聚合成词云数据：同名求和、按次数降序、超出上限的尾部合并为「其他」。
 * 空名称与非正数的记录会被忽略。
 */
export function buildWordCloudItems(
  entries: WordCloudEntry[],
  options?: { limit?: number; otherLabel?: string }
): WordCloudData {
  // NaN / 非数会被 Math.max 透传，导致 slice(0, NaN) 清空全部词条，因此做显式兜底。
  const rawLimit = options?.limit ?? WORD_CLOUD_TOP_LIMIT
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.floor(rawLimit))
    : WORD_CLOUD_TOP_LIMIT
  const otherLabel = options?.otherLabel ?? 'Other'

  const totals = new Map<string, number>()
  for (const entry of entries) {
    const name = entry.name?.trim()
    const value = Number(entry.value)
    if (!name || !Number.isFinite(value) || value <= 0) continue
    totals.set(name, (totals.get(name) ?? 0) + value)
  }

  const sorted = [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

  const total = sorted.reduce((sum, item) => sum + item.value, 0)
  const toItem = (item: WordCloudEntry): WordCloudItem => ({
    ...item,
    share: total > 0 ? item.value / total : 0,
  })

  const items = sorted.slice(0, limit).map(toItem)
  const tail = sorted.slice(limit)
  if (tail.length > 0) {
    const mergedValue = tail.reduce((sum, item) => sum + item.value, 0)
    // 若真实词条已占用「其他」这个名字，聚合项换用带后缀的标签，避免图上出现两个同名词条。
    const aggregateLabel = totals.has(otherLabel)
      ? `${otherLabel} (${tail.length})`
      : otherLabel
    items.push({
      ...toItem({ name: aggregateLabel, value: mergedValue }),
      isAggregate: true,
    })
  }

  return {
    items,
    total,
    mergedCount: tail.length,
    truncated: tail.length > 0,
  }
}
