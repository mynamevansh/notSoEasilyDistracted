import { describe, expect, it } from 'vitest'
import {
  createDefaultCategories,
  DEFAULT_CATEGORY_DEFINITIONS,
} from '../src/types/website-management.ts'

describe('default website categories', () => {
  it('defines the six stable default categories', () => {
    expect(DEFAULT_CATEGORY_DEFINITIONS).toHaveLength(6)
    expect(
      DEFAULT_CATEGORY_DEFINITIONS.map((category) => category.id),
    ).toEqual([
      'default-social-media',
      'default-entertainment',
      'default-gaming',
      'default-shopping',
      'default-news-reading',
      'default-other',
    ])
    expect(
      DEFAULT_CATEGORY_DEFINITIONS.map((category) => category.name),
    ).toEqual([
      'Social Media',
      'Entertainment',
      'Gaming',
      'Shopping',
      'News & Reading',
      'Other',
    ])
    expect(
      new Set(DEFAULT_CATEGORY_DEFINITIONS.map((category) => category.id)).size,
    ).toBe(6)
    expect(
      new Set(DEFAULT_CATEGORY_DEFINITIONS.map((category) => category.name))
        .size,
    ).toBe(6)
    expect(
      DEFAULT_CATEGORY_DEFINITIONS.every((category) => category.isDefault),
    ).toBe(true)
  })

  it('does not include runtime timestamps in imported definitions', () => {
    expect(DEFAULT_CATEGORY_DEFINITIONS).not.toContainEqual(
      expect.objectContaining({
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    )
  })

  it('creates fresh timestamped category objects', () => {
    const categories = createDefaultCategories(1_700_000_000_000)
    const secondCategories = createDefaultCategories(1_800_000_000_000)

    expect(categories).toHaveLength(6)
    expect(categories.every((category) => category.isDefault)).toBe(true)
    expect(categories.every((category) => category.createdAt === 1_700_000_000_000)).toBe(
      true,
    )
    expect(categories.every((category) => category.updatedAt === 1_700_000_000_000)).toBe(
      true,
    )
    expect(categories).not.toBe(secondCategories)
    expect(categories[0]).not.toBe(secondCategories[0])
    expect(secondCategories[0].createdAt).toBe(1_800_000_000_000)
  })
})
