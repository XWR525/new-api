import {
  createSeededRandom,
  layoutWordCloudInMask,
  type WordCloudSprite,
} from '../src/features/dashboard/lib/word-cloud-layout'

const NAMES = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-3-opus',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'deepseek-chat',
  'deepseek-reasoner',
  'qwen-max',
  'qwen-plus',
  'glm-4-plus',
  'moonshot-v1-128k',
  'doubao-pro-32k',
  'ernie-4.0-8k',
  'hunyuan-turbo',
  'step-2-16k',
  'yi-large',
  'minimax-abab6.5s',
  'baichuan4',
  'spark-max',
  'llama-3.1-70b',
  'mistral-large',
  'command-r-plus',
  'jamba-1.5-large',
  'phi-4',
  'gemma-2-27b',
  'nova-pro',
  'o1-mini',
  'o3-mini',
  'Other',
]

const CELL = 4
const width = 1100
const height = 416
const cols = Math.ceil(width / CELL)
const rows = Math.ceil(height / CELL)

const cells = new Uint8Array(cols * rows)
const paint = (x0: number, y0: number, x1: number, y1: number) => {
  for (let r = y0 - 1; r <= y1 + 1; r += 1) {
    for (let c = x0 - 1; c <= x1 + 1; c += 1) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) cells[r * cols + c] = 1
    }
  }
}
const aCenter = Math.floor(cols * 0.36)
for (let r = 0; r < rows; r += 1) {
  const spread = Math.floor((r / rows) * 34)
  paint(aCenter - 50 - spread, r, aCenter - 38 - spread + 6, r)
  paint(aCenter + 6 + spread, r, aCenter + 18 + spread, r)
}
paint(aCenter - 36, Math.floor(rows * 0.62), aCenter + 38, Math.floor(rows * 0.73))
const iCenter = Math.floor(cols * 0.62)
paint(iCenter - 13, 0, iCenter + 13, rows - 1)

type Sprite = WordCloudSprite & { widthCells: number; heightCells: number }

function buildSprite(
  text: string,
  fontSize: number,
  angle: number
): WordCloudSprite {
  const textWidth = Math.max(text.length * fontSize * 0.58, fontSize)
  const lineHeight = fontSize * 1.2
  const radians = (angle * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const c = Math.max(1, Math.ceil((cos * textWidth + sin * lineHeight) / CELL))
  const r = Math.max(1, Math.ceil((sin * textWidth + cos * lineHeight) / CELL))
  return { cols: c, rows: r, cells: new Uint8Array(c * r).fill(1) }
}

const items = NAMES.map((name, index) => ({
  name,
  value: 1000 - index * 20,
  share: 1 / NAMES.length,
  color: '#3366ff',
  isAggregate: name === 'Other',
}))

const CURRENT = [0, 0, 0, -30, 30, -45, 45, -60, 60, 90]
const WITH_INTERMEDIATE = [
  0, 0, 0, -15, 15, -30, 30, -45, 45, -60, 60, -75, 75, 90,
]
const HORIZONTAL_HEAVY = [
  0, 0, 0, 0, 0, -15, 15, -30, 30, -45, 45, -60, 60, -75, 75, 90,
]

const variants: { label: string; angles: number[]; perSize: number }[] = [
  { label: 'A 现状 7 角 / 每字号 3', angles: CURRENT, perSize: 3 },
  { label: 'B 加中间角(13) / 每字号 3', angles: WITH_INTERMEDIATE, perSize: 3 },
  { label: 'C 加中间角(13) / 每字号 5', angles: WITH_INTERMEDIATE, perSize: 5 },
  { label: 'D 现状 7 角 / 每字号 5', angles: CURRENT, perSize: 5 },
  {
    label: 'E 水平加权+中间角(15) / 每字号 5',
    angles: HORIZONTAL_HEAVY,
    perSize: 5,
  },
]

const maskCells = cells.reduce((sum, cell) => sum + cell, 0)
const results: string[] = []

for (const variant of variants) {
  const started = performance.now()
  const result = layoutWordCloudInMask({
    items,
    mask: { width, height, cellSize: CELL, cols, rows, cells },
    buildSprite,
    fontSizeRange: [16, 48],
    repeatRounds: 24,
    fillFontSizeRange: [12, 30],
    angles: variant.angles,
    anglesPerSize: variant.perSize,
    targetCoverage: 0.97,
    overflowRatio: 0.04,
    maxOverflowCells: 1,
    maxAnchorsPerWord: 1500,
    random: createSeededRandom(12345),
  })
  const elapsed = performance.now() - started
  const distinct = new Set(result.words.map((word) => word.name))

  // 复算每个词条的越界格子数，确认"出界"没有变多
  let zeroOverflow = 0
  let totalOutside = 0
  for (const word of result.words) {
    const sprite = buildSprite(word.name, word.fontSize, word.angle)
    const centerCol = Math.floor(sprite.cols / 2)
    const centerRow = Math.floor(sprite.rows / 2)
    const anchorCol = Math.round(word.x / CELL - 0.5)
    const anchorRow = Math.round(word.y / CELL - 0.5)
    let outside = 0
    for (let row = 0; row < sprite.rows; row += 1) {
      for (let col = 0; col < sprite.cols; col += 1) {
        const gridRow = anchorRow + row - centerRow
        const gridCol = anchorCol + col - centerCol
        if (
          gridRow < 0 ||
          gridCol < 0 ||
          gridRow >= rows ||
          gridCol >= cols ||
          cells[gridRow * cols + gridCol] !== 1
        ) {
          outside += 1
        }
      }
    }
    if (outside === 0) zeroOverflow += 1
    totalOutside += outside
  }

  const distinctAngles = new Set(result.words.map((word) => word.angle))
  results.push(
    [
      variant.label.padEnd(34),
      `词条=${String(result.words.length).padStart(3)}`,
      `模型=${distinct.size}/30`,
      `覆盖=${result.coverage.toFixed(3)}`,
      `零越界=${((zeroOverflow / result.words.length) * 100).toFixed(0)}%`,
      `越界格合计=${String(totalOutside).padStart(3)}`,
      `角度数=${distinctAngles.size}`,
      `ms=${elapsed.toFixed(0)}`,
    ].join('  ')
  )
}

console.log(`maskCells=${maskCells}`)
console.log(results.join('\n'))
