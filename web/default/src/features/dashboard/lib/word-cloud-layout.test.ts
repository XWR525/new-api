import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  buildMaskGridFromCoverage,
  createLayoutSeed,
  createSeededRandom,
  layoutWordCloudInMask,
  type PlacedWordCloudWord,
  type WordCloudMaskGrid,
  type WordCloudSprite,
} from './word-cloud-layout'

const CELL_SIZE = 4
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 40
const FILL_MIN = 12
const FILL_MAX = 24
const ANGLES = [0, 0, -30, 30, -45, 45, 90]
const OVERFLOW_RATIO = 0.06
const MAX_OVERFLOW_CELLS = 3
const MIN_FONT_SIZE = 10

function buildItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `model-${index}`,
    value: 100 - index,
    share: (100 - index) / 100,
    color: '#3366ff',
  }))
}

/** 全填充矩形遮罩 */
function rectangularMask(
  width: number,
  height: number,
  cellSize = CELL_SIZE
): WordCloudMaskGrid {
  const cols = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)
  const cells = new Uint8Array(cols * rows).fill(1)
  return { width, height, cellSize, cols, rows, cells }
}

/**
 * 测试用的字形：把词条当作实心矩形（宽度按字符数估算）。
 * 与组件里 canvas 光栅化的结果同构，足以验证布局不变量。
 */
function spriteSize(text: string, fontSize: number, angle: number) {
  const textWidth = Math.max(text.length * fontSize * 0.6, fontSize)
  const lineHeight = fontSize * 1.2
  const radians = (angle * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  return {
    width: cos * textWidth + sin * lineHeight,
    height: sin * textWidth + cos * lineHeight,
  }
}

function buildSprite(
  text: string,
  fontSize: number,
  angle: number
): WordCloudSprite {
  const { width, height } = spriteSize(text, fontSize, angle)
  const cols = Math.max(1, Math.ceil(width / CELL_SIZE))
  const rows = Math.max(1, Math.ceil(height / CELL_SIZE))
  return { cols, rows, cells: new Uint8Array(cols * rows).fill(1) }
}

/** 独立复算词条占用的格子，避免直接用被测实现自证 */
function claimedCells(word: PlacedWordCloudWord, mask: WordCloudMaskGrid) {
  const sprite = buildSprite(word.name, word.fontSize, word.angle)
  const centerCol = Math.floor(sprite.cols / 2)
  const centerRow = Math.floor(sprite.rows / 2)
  const anchorCol = Math.round(word.x / mask.cellSize - 0.5)
  const anchorRow = Math.round(word.y / mask.cellSize - 0.5)
  const indexes: number[] = []
  for (let row = 0; row < sprite.rows; row += 1) {
    for (let col = 0; col < sprite.cols; col += 1) {
      const gridCol = anchorCol + col - centerCol
      const gridRow = anchorRow + row - centerRow
      indexes.push(gridRow * mask.cols + gridCol)
    }
  }
  return { indexes, anchorCol, anchorRow }
}

function layoutOf(overrides: {
  items?: ReturnType<typeof buildItems>
  mask?: WordCloudMaskGrid
  repeatRounds?: number
  seed?: number
}) {
  const mask = overrides.mask ?? rectangularMask(640, 320)
  const items = overrides.items ?? buildItems(18)
  return layoutWordCloudInMask({
    items,
    mask,
    buildSprite,
    fontSizeRange: [FONT_SIZE_MIN, FONT_SIZE_MAX],
    repeatRounds: overrides.repeatRounds ?? 4,
    fillFontSizeRange: [FILL_MIN, FILL_MAX],
    angles: ANGLES,
    overflowRatio: OVERFLOW_RATIO,
    maxOverflowCells: MAX_OVERFLOW_CELLS,
    random: createSeededRandom(overrides.seed ?? 20260911),
  })
}

describe('dashboard word cloud layout', () => {
  test('places words by glyph pixels without overlap or escaping the mask', () => {
    const mask = rectangularMask(640, 320)
    const { words, coverage } = layoutOf({ mask })

    assert.ok(words.length > 0, 'expected at least one placed word')
    assert.ok(coverage > 0 && coverage <= 1)

    const claimed = new Set<number>()
    for (const word of words) {
      const { indexes, anchorCol, anchorRow } = claimedCells(word, mask)

      // 锚点落在网格内
      assert.ok(anchorCol >= 0 && anchorCol < mask.cols)
      assert.ok(anchorRow >= 0 && anchorRow < mask.rows)

      // 越界格子既不超过比例，也不超过绝对上限（长模型名不能大段戳出轮廓）
      const outside = indexes.filter((index) => mask.cells[index] !== 1).length
      assert.ok(
        1 - (indexes.length - outside) / indexes.length <=
          OVERFLOW_RATIO + 1e-9,
        `word ${word.name} overflowed the mask`
      )
      assert.ok(
        outside <= MAX_OVERFLOW_CELLS,
        `word ${word.name} poked ${outside} cells out of the mask`
      )

      // 字形格子不与其它词条重叠（"像素级避让"的核心保证）
      for (const index of indexes) {
        assert.ok(
          !claimed.has(index),
          `word ${word.name} overlaps another word`
        )
        claimed.add(index)
      }
    }

    // 自报覆盖率与实际占用一致
    const maskCells = mask.cells.reduce((sum, cell) => sum + cell, 0)
    assert.equal(coverage, claimed.size / maskCells)
  })

  test('keeps every model present even when the mask gets crowded', () => {
    const mask = rectangularMask(640, 320)
    const items = buildItems(18)
    const { words } = layoutOf({ mask, items, repeatRounds: 6 })

    const placed = new Set(words.map((word) => word.name))
    const missing = items
      .map((item) => item.name)
      .filter((name) => !placed.has(name))
    assert.deepEqual(missing, [])
  })

  test('fills the mask densely enough to read as a shape', () => {
    const mask = rectangularMask(480, 240)
    const { coverage } = layoutOf({
      mask,
      items: buildItems(24),
      repeatRounds: 8,
    })

    // 周围框近似只能铺到 30% 上下；字形级避让应明显更满
    assert.ok(coverage >= 0.5, `coverage too low: ${coverage}`)
  })

  test('keeps every placed word readable and shrinks only when needed', () => {
    const { words } = layoutOf({ items: buildItems(12) })

    assert.ok(words.length > 0)
    for (const word of words) {
      assert.ok(
        word.fontSize >= MIN_FONT_SIZE,
        `word ${word.name} rendered at ${word.fontSize}px`
      )
      const upperBound = word.round === 0 ? FONT_SIZE_MAX : FILL_MAX
      assert.ok(word.fontSize <= upperBound)
    }
  })

  test('repeats the same model across filling rounds', () => {
    const { words } = layoutOf({ items: buildItems(4), repeatRounds: 4 })

    const distinct = new Set(words.map((word) => word.name))
    assert.ok(distinct.size <= 4)
    assert.ok(
      words.length > distinct.size,
      'expected repeated occurrences of the same models'
    )
    assert.ok(words.some((word) => word.round > 0))
  })

  test('uses the requested rotation angles', () => {
    const { words } = layoutOf({ items: buildItems(20), repeatRounds: 6 })
    const angles = new Set(words.map((word) => word.angle))

    for (const angle of angles) {
      assert.ok(ANGLES.includes(angle), `unexpected angle ${angle}`)
    }
    // 至少出现一个非水平角度，否则旋转没生效
    assert.ok([...angles].some((angle) => angle !== 0))
  })

  test('is deterministic for the same seed and data', () => {
    assert.deepEqual(layoutOf({ seed: 7 }), layoutOf({ seed: 7 }))
  })

  test('returns nothing when the mask has no glyph area', () => {
    const mask = rectangularMask(320, 160)
    mask.cells.fill(0)

    const result = layoutOf({ mask, items: buildItems(5) })
    assert.deepEqual(result.words, [])
    assert.equal(result.coverage, 0)
  })
})

describe('word cloud mask grid', () => {
  test('marks only cells whose coverage reaches the threshold', () => {
    // 左半边"属于字形"
    const grid = buildMaskGridFromCoverage((x) => (x < 40 ? 255 : 0), {
      width: 80,
      height: 20,
      cellSize: 4,
    })

    assert.equal(grid.cols, 20)
    assert.equal(grid.rows, 5)
    for (let gy = 0; gy < grid.rows; gy += 1) {
      for (let gx = 0; gx < grid.cols; gx += 1) {
        const expected = gx < 10 ? 1 : 0
        assert.equal(
          grid.cells[gy * grid.cols + gx],
          expected,
          `cell ${gx},${gy}`
        )
      }
    }
  })

  test('dilateCells grows the glyph area by exactly the given radius', () => {
    // 一个 8×8 像素的方块 → 2×2 个格子
    const coverage = (x: number, y: number) =>
      x >= 40 && x < 48 && y >= 8 && y < 16 ? 255 : 0
    const options = { width: 80, height: 24, cellSize: 4 } as const
    const plain = buildMaskGridFromCoverage(coverage, options)
    const grown = buildMaskGridFromCoverage(coverage, {
      ...options,
      dilateCells: 1,
    })

    const count = (grid: typeof plain) =>
      grid.cells.reduce((sum, cell) => sum + cell, 0)

    // 原字形占 2×2 格；外扩 1 格后变成 4×4 格
    assert.equal(count(plain), 4)
    assert.equal(count(grown), 16)
    // 外扩不会丢掉原来的格子
    for (let index = 0; index < plain.cells.length; index += 1) {
      if (plain.cells[index] === 1) {
        assert.equal(grown.cells[index], 1, `cell ${index} lost by dilation`)
      }
    }
  })

  test('seeded random stays inside [0, 1)', () => {
    const random = createSeededRandom(42)
    for (let i = 0; i < 200; i += 1) {
      const value = random()
      assert.ok(value >= 0 && value < 1)
    }
  })

  test('layout seed changes with data and canvas size', () => {
    const items = buildItems(3)
    assert.notEqual(
      createLayoutSeed(items, 400, 200),
      createLayoutSeed(items, 401, 200)
    )
    assert.notEqual(
      createLayoutSeed(items, 400, 200),
      createLayoutSeed(buildItems(4), 400, 200)
    )
  })
})
