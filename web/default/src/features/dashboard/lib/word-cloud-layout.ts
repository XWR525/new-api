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
// Dashboard Word Cloud —— 文字遮罩布局（字形像素级避让）
//
// 参考 wordcloud / wordcloud2.js 这类成熟实现的做法，核心是**按字形像素**而不是
// 包围盒判断能否放置：每个词条先光栅化成"字形格子"（sprite），再在遮罩内部按
// "离形状中心由近及远"的顺序扫描锚点，要求
//   ① 字形格子落在遮罩内（优先完全不越界，确实放不下才允许极少量越界），
//   ② 不与已放置词条的字形格子重叠。
// 这样词条能互相咬合、填满笔画，又不会让个别长词条戳出轮廓。
//
// 布局本身不依赖 canvas：遮罩以网格传入，字形通过 `buildSprite` 注入，
// 因此可以用矩形遮罩与矩形 sprite 在单元测试里验证不变量。
// ----------------------------------------------------------------------------

/** 字形遮罩网格：`cells[i] === 1` 表示该格子落在字形内部。 */
export interface WordCloudMaskGrid {
  width: number
  height: number
  cellSize: number
  cols: number
  rows: number
  cells: Uint8Array
}

/** 词条光栅化后的字形格子（相对词条中心的网格占用） */
export interface WordCloudSprite {
  cols: number
  rows: number
  /** 1 = 该格有字形像素 */
  cells: Uint8Array
}

export interface WordCloudLayoutItem {
  name: string
  value: number
  share: number
  color: string
  isAggregate?: boolean
}

export interface PlacedWordCloudWord extends WordCloudLayoutItem {
  x: number
  y: number
  fontSize: number
  angle: number
  /** 0 = 主词（调用量最高的词条），> 0 = 第几轮重复填充 */
  round: number
}

export interface WordCloudLayoutOptions {
  items: WordCloudLayoutItem[]
  mask: WordCloudMaskGrid
  /** 把词条光栅化成字形格子（必须与最终渲染使用同一字体） */
  buildSprite: (
    text: string,
    fontSize: number,
    angle: number
  ) => WordCloudSprite
  /** 主词字号范围（按调用量排名映射，第 1 名取上限） */
  fontSizeRange: readonly [number, number]
  /** 重复填充的轮数，0 表示只放主词 */
  repeatRounds: number
  /** 重复轮的字号范围 */
  fillFontSizeRange: readonly [number, number]
  /** 允许的旋转角度（度） */
  angles: readonly number[]
  /** 随机源，默认 Math.random；测试可注入固定种子 */
  random?: () => number
  /** 允许落在字形外的格子比例上限（0~1） */
  overflowRatio?: number
  /**
   * 单个词条最多允许越出遮罩的格子数（绝对值）。
   * 只按比例限制时，长模型名的 15% 可能是十几个格子，会明显戳出笔画外破坏轮廓。
   */
  maxOverflowCells?: number
  /** 目标覆盖率（0~1），达到后不再继续填充 */
  targetCoverage?: number
  /** 单个词条每个字号的最大扫描锚点数 */
  maxAnchorsPerWord?: number
  /**
   * 同一字号最多尝试几个不同的旋转角度。
   * 角度池越大，单个角度被抽中的概率越低；想要"更多角度带来更高密度"，
   * 通常需要同时把这个值调大。
   */
  anglesPerSize?: number
  /**
   * 字号硬下限：放不下时逐级缩小，但不会小于它。
   * 调小能让更小的词填进零散小空隙（更满），代价是可读性下降。
   */
  minFontSize?: number
}

export interface WordCloudLayoutResult {
  words: PlacedWordCloudWord[]
  /** 遮罩内被字形占用的格子比例 */
  coverage: number
}

const DEFAULT_OVERFLOW_RATIO = 0.15
const DEFAULT_MAX_OVERFLOW_CELLS = 6
const DEFAULT_TARGET_COVERAGE = 0.9
// 两阶段扫描（先零越界、再允许少量越界）会把锚点扫描翻倍，因此把单阶段预算调低
const DEFAULT_MAX_ANCHORS = 900
/** 放不下时按此比例依次缩小字号重试 */
const FONT_SHRINK_FACTOR = 0.82
/** 字号硬下限：再小就没有可读性，宁可少放几个词 */
const DEFAULT_MIN_FONT_SIZE = 12
/** 同一字号默认最多尝试几个旋转角度 */
const DEFAULT_ANGLES_PER_SIZE = 3

/**
 * 用采样函数构建字形遮罩网格。
 * `coverageAt` 返回 0~255 的"属于字形"的强度（例如黑色文字取 255 - 亮度）。
 */
export function buildMaskGridFromCoverage(
  coverageAt: (x: number, y: number) => number,
  options: {
    width: number
    height: number
    cellSize: number
    threshold?: number
    /**
     * 遮罩外扩的格子数。词条要求"完全落在字形内"时贴不到边界、笔画会被啃掉一圈；
     * 外扩 1 格（等于 cellSize 像素，肉眼几乎不可见）能让词条贴边填满，
     * 又不像放宽越界那样出现长词条戳出轮廓。
     */
    dilateCells?: number
  }
): WordCloudMaskGrid {
  const cellSize = Math.max(1, Math.floor(options.cellSize))
  const width = Math.max(1, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const cols = Math.max(1, Math.ceil(width / cellSize))
  const rows = Math.max(1, Math.ceil(height / cellSize))
  const threshold = options.threshold ?? 128
  const cells = new Uint8Array(cols * rows)
  // 每格采样 3×3 个点取最大值：笔画边缘的格子不会被整格丢掉
  const offsets = [0.15, 0.5, 0.85]

  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      let maxCoverage = 0
      for (const oy of offsets) {
        for (const ox of offsets) {
          const px = Math.min(
            width - 1,
            Math.floor(gx * cellSize + ox * cellSize)
          )
          const py = Math.min(
            height - 1,
            Math.floor(gy * cellSize + oy * cellSize)
          )
          const coverage = coverageAt(px, py)
          if (coverage > maxCoverage) maxCoverage = coverage
        }
      }
      cells[gy * cols + gx] = maxCoverage >= threshold ? 1 : 0
    }
  }

  const dilateCells = Math.max(0, Math.floor(options.dilateCells ?? 0))
  return {
    width,
    height,
    cellSize,
    cols,
    rows,
    cells: dilateCells > 0 ? dilate(cells, cols, rows, dilateCells) : cells,
  }
}

/** 形态学膨胀：把字形向外扩 `radius` 格 */
function dilate(
  cells: Uint8Array,
  cols: number,
  rows: number,
  radius: number
): Uint8Array {
  const result = new Uint8Array(cells.length)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      if (cells[index] === 1) {
        result[index] = 1
        continue
      }
      let filled = 0
      for (let dy = -radius; dy <= radius && filled === 0; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const neighbourRow = row + dy
          const neighbourCol = col + dx
          if (
            neighbourRow < 0 ||
            neighbourCol < 0 ||
            neighbourRow >= rows ||
            neighbourCol >= cols
          ) {
            continue
          }
          if (cells[neighbourRow * cols + neighbourCol] === 1) {
            filled = 1
            break
          }
        }
      }
      result[index] = filled
    }
  }
  return result
}

/** mulberry32：小巧的确定性随机源，保证同一份数据每次布局一致 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 由词条与画布尺寸推导布局种子：数据或尺寸变化时重新排布，否则保持稳定 */
export function createLayoutSeed(
  items: readonly WordCloudLayoutItem[],
  width: number,
  height: number
): number {
  let hash = 2166136261
  for (const item of items) {
    const key = `${item.name}\u0000${item.value}`
    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
  }
  hash ^= Math.round(width) + Math.round(height) * 31
  return hash >>> 0
}

/**
 * 把词条排布进字形遮罩，返回绘制坐标（画布坐标系，原点左上）。
 * 第 0 轮按调用量排名决定字号（放不下会逐级缩小），随后先保证每个词条都出现，
 * 再重复填充剩余空隙。
 */
export function layoutWordCloudInMask(
  options: WordCloudLayoutOptions
): WordCloudLayoutResult {
  const { items, mask, buildSprite, fontSizeRange, fillFontSizeRange, angles } =
    options
  const random = options.random ?? Math.random
  const overflowRatio = Math.min(
    1,
    Math.max(0, options.overflowRatio ?? DEFAULT_OVERFLOW_RATIO)
  )
  const maxOverflowCells = Math.max(
    0,
    Math.floor(options.maxOverflowCells ?? DEFAULT_MAX_OVERFLOW_CELLS)
  )
  const targetCoverage = Math.min(
    1,
    Math.max(0, options.targetCoverage ?? DEFAULT_TARGET_COVERAGE)
  )
  const maxAnchors = Math.max(
    1,
    Math.floor(options.maxAnchorsPerWord ?? DEFAULT_MAX_ANCHORS)
  )
  const repeatRounds = Math.max(0, Math.floor(options.repeatRounds))
  const anglesPerSize = Math.max(
    1,
    Math.floor(options.anglesPerSize ?? DEFAULT_ANGLES_PER_SIZE)
  )
  const minFontSize = Math.max(
    1,
    Math.floor(options.minFontSize ?? DEFAULT_MIN_FONT_SIZE)
  )
  const { cols, rows, cellSize, cells } = mask

  const maskCellCount = countCells(cells, 1)
  if (items.length === 0 || cols <= 0 || rows <= 0 || angles.length === 0) {
    return { words: [], coverage: 0 }
  }
  if (maskCellCount === 0) {
    return { words: [], coverage: 0 }
  }

  // 锚点顺序：离字形中心由近及远，让词条从中心向外咬合填满（经典词云观感）
  const anchors = buildAnchorOrder(cells, cols, rows)

  const occupied = new Uint8Array(cells.length)
  let occupiedCount = 0
  const words: PlacedWordCloudWord[] = []
  // 字形按 (文本, 字号, 角度) 缓存：填充轮次会反复用到同一批组合。
  // 格子以"相对锚点的索引偏移"预烘焙，并记录相对行列范围，
  // 这样放置时只需一次边界排除 + 直接索引，避免每个格子的乘法和越界判断
  const spriteCache = new Map<
    string,
    {
      offsets: Int32Array
      colMin: number
      colMax: number
      rowMin: number
      rowMax: number
    }
  >()

  const spriteFor = (name: string, size: number, angle: number) => {
    const key = `${name}\u0000${size}\u0000${angle}`
    const cached = spriteCache.get(key)
    if (cached) return cached

    const sprite = buildSprite(name, size, angle)
    const cellsList = spriteCellOffsets(sprite)
    const centerCol = Math.floor(sprite.cols / 2)
    const centerRow = Math.floor(sprite.rows / 2)
    const offsets = new Int32Array(cellsList.length)
    let colMin = 0
    let colMax = 0
    let rowMin = 0
    let rowMax = 0
    for (let i = 0; i < cellsList.length; i += 1) {
      const relativeCol = cellsList[i].col - centerCol
      const relativeRow = cellsList[i].row - centerRow
      offsets[i] = relativeRow * cols + relativeCol
      if (relativeCol < colMin) colMin = relativeCol
      if (relativeCol > colMax) colMax = relativeCol
      if (relativeRow < rowMin) rowMin = relativeRow
      if (relativeRow > rowMax) rowMax = relativeRow
    }

    const entry = { offsets, colMin, colMax, rowMin, rowMax }
    spriteCache.set(key, entry)
    return entry
  }

  const tryPlace = (
    item: WordCloudLayoutItem,
    fontSize: number,
    round: number,
    spread = false,
    budget = maxAnchors
  ): boolean => {
    let size = fontSize
    // 放不下时逐级缩小字号重试（与 wordcloud 库的行为一致）
    while (size >= minFontSize) {
      // 同一字号尝试多个角度：长模型名在细笔画里往往只有竖排（90°）放得下，
      // 每个字号只随机试一个角度会大量漏放
      const candidateAngles = pickAngles(angles, random, anglesPerSize)
      for (const angle of candidateAngles) {
        const sprite = spriteFor(item.name, size, angle)
        const spriteOffsets = sprite.offsets
        if (spriteOffsets.length === 0) continue
        // 越界上限取"比例"与"绝对格子数"的较小值，避免长模型名大段戳出笔画
        const maxOverflow = Math.min(
          Math.floor(spriteOffsets.length * overflowRatio),
          maxOverflowCells
        )
        // 先要求完全落在遮罩内，确实放不下才允许少量越界：
        // 这样词条优先"完整地"待在笔画里，轮廓不会被个别长词条破坏
        const overflowLimits = maxOverflow > 0 ? [0, maxOverflow] : [0]

        for (const allowedOverflow of overflowLimits) {
          // 每个词条、每个字号都从随机锚点开始扫描：否则后放的词条会被
          // "中心已占满"卡死，永远填不到外圈
          const start = Math.floor(random() * anchors.length)
          // 主词用连续扫描（由内向外咬合，观感更像经典词云）；
          // 填充/兜底用跨越整幅的步进扫描，否则会被"某一段全满"挡住而漏掉零散空隙
          const stride = spread
            ? coprimeStride(
                Math.max(1, Math.floor(anchors.length / maxAnchors)),
                anchors.length
              )
            : 1

          for (let step = 0; step < budget; step += 1) {
            const anchorIndex =
              anchors[(start + step * stride) % anchors.length]
            const anchorCol = anchorIndex % cols
            const anchorRow = Math.floor(anchorIndex / cols)

            // 一次行列范围排除：越出画布的位置直接跳过，内层循环就不必再判边界
            if (
              anchorCol + sprite.colMin < 0 ||
              anchorCol + sprite.colMax >= cols ||
              anchorRow + sprite.rowMin < 0 ||
              anchorRow + sprite.rowMax >= rows
            ) {
              continue
            }

            let outside = 0
            let blocked = false
            for (let i = 0; i < spriteOffsets.length; i += 1) {
              const index = anchorIndex + spriteOffsets[i]
              if (occupied[index] === 1) {
                blocked = true
                break
              }
              if (cells[index] !== 1) {
                outside += 1
                if (outside > allowedOverflow) {
                  blocked = true
                  break
                }
              }
            }
            if (blocked) continue

            // 接受：按字形格子占位。占用标记覆盖整个字形（含越界部分，避免后续词条压上来），
            // 但覆盖率只统计落在遮罩内的格子
            for (let i = 0; i < spriteOffsets.length; i += 1) {
              const index = anchorIndex + spriteOffsets[i]
              if (occupied[index] === 0) {
                occupied[index] = 1
                if (cells[index] === 1) occupiedCount += 1
              }
            }
            words.push({
              ...item,
              x: (anchorCol + 0.5) * cellSize,
              y: (anchorRow + 0.5) * cellSize,
              fontSize: size,
              angle,
              round,
            })
            return true
          }
        }
      }

      size = Math.floor(size * FONT_SHRINK_FACTOR)
    }

    return false
  }

  const keywordMin = Math.min(fontSizeRange[0], fontSizeRange[1])
  const keywordMax = Math.max(fontSizeRange[0], fontSizeRange[1])
  const fillMin = Math.max(
    1,
    Math.min(fillFontSizeRange[0], fillFontSizeRange[1])
  )
  const fillMax = Math.max(
    fillMin,
    Math.max(fillFontSizeRange[0], fillFontSizeRange[1])
  )

  // 第 0 轮：主词按调用量取字号；放置顺序改为"字形面积从大到小"，
  // 大词/长模型名最难塞进笔画，先放成功率高得多（经典词云的 largest-first 策略）
  const keywordPlacements = items
    .map((item, index) => ({
      item,
      fontSize: rankFontSize(index, items.length, keywordMin, keywordMax),
    }))
    .sort(
      (a, b) =>
        b.fontSize * b.item.name.length - a.fontSize * a.item.name.length
    )

  const placedNames = new Set<string>()
  for (const placement of keywordPlacements) {
    if (tryPlace(placement.item, placement.fontSize, 0)) {
      placedNames.add(placement.item.name)
    }
  }

  // 兜底：在填充空隙之前先保证每个词条至少出现一次（最小可读字号 + 更宽的锚点扫描），
  // 否则大词填满字形后，长模型名再也没地方放
  const inclusionBudget = Math.min(anchors.length, maxAnchors * 6)
  for (const item of items) {
    if (placedNames.has(item.name)) continue
    if (tryPlace(item, minFontSize, 0, true, inclusionBudget)) {
      placedNames.add(item.name)
    }
  }

  // 后续轮：重复填充剩余空隙，直到达到目标覆盖率或用完轮数。
  // 填充字号随轮次递减（大词先填大空隙、小词后填边角），否则小空隙永远填不上
  for (let round = 1; round <= repeatRounds; round += 1) {
    if (occupiedCount / maskCellCount >= targetCoverage) break
    const candidates = shuffle(items, random)
    const progress = repeatRounds > 1 ? (round - 1) / (repeatRounds - 1) : 0
    const baseFontSize = fillMax - (fillMax - fillMin) * progress
    const jitterRange = (fillMax - fillMin) * 0.3
    let placedInRound = 0
    for (const item of candidates) {
      const jitter = (random() - 0.5) * jitterRange
      const fontSize = Math.round(
        Math.min(fillMax, Math.max(fillMin, baseFontSize + jitter))
      )
      if (tryPlace(item, Math.max(1, fontSize), round, true)) placedInRound += 1
    }
    if (placedInRound === 0) break
  }

  return { words, coverage: occupiedCount / maskCellCount }
}

function countCells(cells: Uint8Array, value: number): number {
  let count = 0
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === value) count += 1
  }
  return count
}

/** 字形格子坐标（相对 sprite 左上角） */
function spriteCellOffsets(
  sprite: WordCloudSprite
): { col: number; row: number }[] {
  const offsets: { col: number; row: number }[] = []
  for (let row = 0; row < sprite.rows; row += 1) {
    for (let col = 0; col < sprite.cols; col += 1) {
      if (sprite.cells[row * sprite.cols + col] === 1) {
        offsets.push({ col, row })
      }
    }
  }
  return offsets
}

/** 按到字形质心的距离升序排列锚点，形成由内向外填充的顺序 */
function buildAnchorOrder(
  cells: Uint8Array,
  cols: number,
  rows: number
): number[] {
  let sumCol = 0
  let sumRow = 0
  let count = 0
  const indexes: number[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      if (cells[index] !== 1) continue
      indexes.push(index)
      sumCol += col
      sumRow += row
      count += 1
    }
  }
  const centerCol = count > 0 ? sumCol / count : 0
  const centerRow = count > 0 ? sumRow / count : 0

  return indexes.sort((a, b) => {
    const distanceA = anchorDistance(a, cols, centerCol, centerRow)
    const distanceB = anchorDistance(b, cols, centerCol, centerRow)
    return distanceA - distanceB || a - b
  })
}

function anchorDistance(
  index: number,
  cols: number,
  centerCol: number,
  centerRow: number
): number {
  const col = index % cols
  const row = Math.floor(index / cols)
  const dCol = col - centerCol
  const dRow = row - centerRow
  return dCol * dCol + dRow * dRow
}

function rankFontSize(
  index: number,
  total: number,
  min: number,
  max: number
): number {
  if (total <= 1) return Math.round(max)
  const ratio = index / (total - 1)
  return Math.round(max - ratio * (max - min))
}

/** 保证步进与列表长度互质，避免步进扫描只覆盖到一部分锚点 */
function coprimeStride(stride: number, length: number): number {
  const greatestCommonDivisor = (a: number, b: number): number =>
    b === 0 ? a : greatestCommonDivisor(b, a % b)
  let candidate = Math.max(1, stride)
  while (candidate < length && greatestCommonDivisor(candidate, length) > 1) {
    candidate += 1
  }
  return candidate >= length ? 1 : candidate
}

/** 从允许的角度里随机取若干个不重复的角度 */
function pickAngles(
  angles: readonly number[],
  random: () => number,
  count: number
): number[] {
  if (angles.length <= count) return [...angles]
  const picked: number[] = []
  const used = new Set<number>()
  let guard = 0
  while (picked.length < count && guard < count * 8) {
    guard += 1
    const index = Math.floor(random() * angles.length)
    if (used.has(index)) continue
    used.add(index)
    picked.push(angles[index])
  }
  return picked
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const result = [...list]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = result[i]
    result[i] = result[j]
    result[j] = swap
  }
  return result
}
