import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildWordCloudItems } from './word-cloud'

describe('dashboard word cloud data', () => {
  test('sums duplicate names and sorts by call count descending', () => {
    const data = buildWordCloudItems([
      { name: 'gpt-4o', value: 2 },
      { name: 'claude-sonnet', value: 5 },
      { name: 'gpt-4o', value: 3 },
    ])

    // 次数相同的词条按名称排序，保证渲染顺序稳定
    assert.deepEqual(
      data.items.map((item) => [item.name, item.value]),
      [
        ['claude-sonnet', 5],
        ['gpt-4o', 5],
      ]
    )
    assert.equal(data.total, 10)
    assert.equal(data.mergedCount, 0)
    assert.equal(data.truncated, false)
    assert.equal(data.items[0].share, 0.5)
  })

  test('merges the tail beyond the limit into the other bucket', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `model-${index}`,
      value: 10 - index,
    }))

    const data = buildWordCloudItems(entries, { limit: 3, otherLabel: '其他' })

    assert.deepEqual(
      data.items.map((item) => [item.name, item.value]),
      [
        ['model-0', 10],
        ['model-1', 9],
        ['model-2', 8],
        ['其他', 13],
      ]
    )
    assert.equal(data.total, 40)
    assert.equal(data.mergedCount, 2)
    assert.equal(data.truncated, true)
    assert.equal(data.items[3].share, 13 / 40)
  })

  test('does not add an other bucket when every word fits', () => {
    const data = buildWordCloudItems(
      [
        { name: 'a', value: 1 },
        { name: 'b', value: 1 },
      ],
      { limit: 2, otherLabel: '其他' }
    )

    assert.deepEqual(
      data.items.map((item) => item.name),
      ['a', 'b']
    )
    assert.equal(data.truncated, false)
  })

  test('ignores blank names and non-positive values', () => {
    const data = buildWordCloudItems([
      { name: '', value: 100 },
      { name: '   ', value: 50 },
      { name: 'gpt-4o', value: 0 },
      { name: 'claude-sonnet', value: -3 },
      { name: ' gemini-pro ', value: 4 },
    ])

    assert.deepEqual(
      data.items.map((item) => [item.name, item.value]),
      [['gemini-pro', 4]]
    )
    assert.equal(data.total, 4)
  })

  test('returns an empty result for empty input', () => {
    const data = buildWordCloudItems([])

    assert.deepEqual(data.items, [])
    assert.equal(data.total, 0)
    assert.equal(data.truncated, false)
  })

  test('marks the aggregate bucket instead of relying on its name', () => {
    const data = buildWordCloudItems(
      [
        { name: 'model-0', value: 10 },
        { name: 'model-1', value: 5 },
        { name: 'model-2', value: 3 },
      ],
      { limit: 2, otherLabel: '其他' }
    )

    assert.deepEqual(
      data.items.map((item) => [item.name, item.isAggregate ?? false]),
      [
        ['model-0', false],
        ['model-1', false],
        ['其他', true],
      ]
    )
  })

  test('avoids a duplicate label when a real entry is already named like the bucket', () => {
    const data = buildWordCloudItems(
      [
        { name: '其他', value: 10 },
        { name: 'model-1', value: 5 },
        { name: 'model-2', value: 3 },
      ],
      { limit: 2, otherLabel: '其他' }
    )

    const names = data.items.map((item) => item.name)
    assert.equal(new Set(names).size, names.length)
    assert.deepEqual(names, ['其他', 'model-1', '其他 (1)'])
    assert.equal(data.items[2].isAggregate, true)
  })

  test('falls back to the default limit when the limit is not a finite number', () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      name: `model-${index}`,
      value: 3 - index,
    }))

    const data = buildWordCloudItems(entries, { limit: Number.NaN })

    assert.equal(data.items.length, 3)
    assert.equal(data.truncated, false)
  })
})
