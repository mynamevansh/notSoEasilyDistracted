import { describe, expect, it } from 'vitest'
import {
  DNR_RULE_ID_ALLOCATION_MAX,
  DNR_RULE_ID_ALLOCATION_MIN,
  DNR_RULE_ID_ALLOCATION_SIZE,
  DnrRuleIdAllocationError,
  allocateDnrRuleIds,
  hashDnrRuleWebsiteId,
} from '../src/dnr/dnr-rule-id-allocation.ts'

function allocate(
  websiteIds: readonly string[],
  existingAssignments?: readonly {
    readonly websiteId: string
    readonly ruleId: number
  }[],
  reservedRuleIds?: readonly number[],
) {
  return allocateDnrRuleIds({
    websiteIds,
    existingAssignments,
    reservedRuleIds,
  })
}

describe('allocateDnrRuleIds', () => {
  it('uses the documented FNV-1a-style hash vectors', () => {
    expect(hashDnrRuleWebsiteId('a')).toBe(0xe40c292c)
    expect(hashDnrRuleWebsiteId('😀')).toBe(0xcb31c4b8)
  })

  it('allocates deterministically', () => {
    expect(allocate(['website-a', 'website-b'])).toEqual(
      allocate(['website-a', 'website-b']),
    )
  })

  it('does not change allocations when website input order changes', () => {
    expect(allocate(['website-b', 'website-a'])).toEqual(
      allocate(['website-a', 'website-b']),
    )
  })

  it('preserves every valid existing assignment unchanged', () => {
    const result = allocate(
      ['website-a', 'website-b'],
      [
        { websiteId: 'website-b', ruleId: 175_000 },
      ],
    )

    expect(result).toContainEqual({
      websiteId: 'website-b',
      ruleId: 175_000,
    })
  })

  it('adds a third website without changing previous assignments', () => {
    const first = allocate(
      ['website-a', 'website-b'],
    )
    const second = allocate(
      ['website-a', 'website-b', 'website-c'],
      first,
    )

    for (const assignment of first) {
      expect(second).toContainEqual(assignment)
    }
  })

  it('preserves two original assignments when a third hash candidate collides', () => {
    const originalAssignments = allocate(['website-a', 'website-b'])
    const thirdWebsiteId = 'collision-third-101019'
    const thirdCandidate =
      DNR_RULE_ID_ALLOCATION_MIN +
      (hashDnrRuleWebsiteId(thirdWebsiteId) %
        DNR_RULE_ID_ALLOCATION_SIZE)

    expect(
      originalAssignments.some(
        (assignment) => assignment.ruleId === thirdCandidate,
      ),
    ).toBe(true)

    const second = allocate(
      ['website-a', 'website-b', thirdWebsiteId],
      originalAssignments,
    )

    for (const assignment of originalAssignments) {
      expect(second).toContainEqual(assignment)
    }
    const thirdAssignment = second.find(
      (assignment) => assignment.websiteId === thirdWebsiteId,
    )
    expect(thirdAssignment).toBeDefined()
    expect(thirdAssignment?.ruleId).not.toBe(thirdCandidate)
  })

  it('resolves collisions deterministically with linear probing', () => {
    const websiteId = 'collision-website'
    const firstOffset =
      hashDnrRuleWebsiteId(websiteId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const occupiedRuleId =
      DNR_RULE_ID_ALLOCATION_MIN + firstOffset
    const nextRuleId =
      DNR_RULE_ID_ALLOCATION_MIN +
      ((firstOffset + 1) % DNR_RULE_ID_ALLOCATION_SIZE)

    const result = allocate(
      [websiteId, 'existing-website'],
      [{ websiteId: 'existing-website', ruleId: occupiedRuleId }],
    )

    expect(result).toContainEqual({
      websiteId,
      ruleId: nextRuleId,
    })
  })

  it('skips reserved IDs', () => {
    const websiteId = 'reserved-website'
    const firstOffset =
      hashDnrRuleWebsiteId(websiteId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const reservedRuleId =
      DNR_RULE_ID_ALLOCATION_MIN + firstOffset

    const result = allocate(
      [websiteId],
      undefined,
      [reservedRuleId],
    )

    expect(result).toEqual([
      {
        websiteId,
        ruleId:
          DNR_RULE_ID_ALLOCATION_MIN +
          ((firstOffset + 1) % DNR_RULE_ID_ALLOCATION_SIZE),
      },
    ])
  })

  it('wraps linear probing from the upper boundary to the lower boundary', () => {
    const websiteId = 'wrap-906'
    const firstOffset =
      hashDnrRuleWebsiteId(websiteId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const reservedRuleIds = Array.from(
      { length: DNR_RULE_ID_ALLOCATION_MAX - (DNR_RULE_ID_ALLOCATION_MIN + firstOffset) + 1 },
      (_, index) => DNR_RULE_ID_ALLOCATION_MIN + firstOffset + index,
    )

    const result = allocate(
      [websiteId],
      undefined,
      reservedRuleIds,
    )

    expect(result).toEqual([
      {
        websiteId,
        ruleId: DNR_RULE_ID_ALLOCATION_MIN,
      },
    ])
  })

  it('rejects null existingAssignments', () => {
    expect(() =>
      allocateDnrRuleIds({
        websiteIds: ['website-a'],
        existingAssignments: null as unknown as [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('rejects null reservedRuleIds', () => {
    expect(() =>
      allocateDnrRuleIds({
        websiteIds: ['website-a'],
        reservedRuleIds: null as unknown as [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-reserved-rule-id',
      }),
    )
  })

  it('rejects duplicate website IDs', () => {
    expect(() =>
      allocate(['website-a', 'website-a']),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-website-id',
      }),
    )
  })

  it('rejects duplicate existing assignments', () => {
    expect(() =>
      allocate(
        ['website-a'],
        [
          { websiteId: 'website-a', ruleId: 150_000 },
          { websiteId: 'website-a', ruleId: 150_001 },
        ],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-existing-assignment',
      }),
    )
  })

  it('rejects the same rule ID assigned to different websites', () => {
    expect(() =>
      allocate(
        ['website-a', 'website-b'],
        [
          { websiteId: 'website-a', ruleId: 150_000 },
          { websiteId: 'website-b', ruleId: 150_000 },
        ],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'rule-id-conflict',
      }),
    )
  })

  it('rejects invalid existing rule IDs', () => {
    for (const ruleId of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      DNR_RULE_ID_ALLOCATION_MIN - 1,
    ]) {
      expect(() =>
        allocate(
          ['website-a'],
          [{ websiteId: 'website-a', ruleId }],
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-existing-assignment',
        }),
      )
    }
  })

  it('rejects invalid reserved IDs', () => {
    for (const ruleId of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      DNR_RULE_ID_ALLOCATION_MAX + 1,
    ]) {
      expect(() =>
        allocate(['website-a'], undefined, [ruleId]),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-reserved-rule-id',
        }),
      )
    }
  })

  it('rejects duplicate reserved IDs', () => {
    expect(() =>
      allocate(
        ['website-a'],
        undefined,
        [150_000, 150_000],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-reserved-rule-id',
      }),
    )
  })

  it('reports allocation-range exhaustion', () => {
    const reservedRuleIds = Array.from(
      { length: DNR_RULE_ID_ALLOCATION_SIZE },
      (_, index) => DNR_RULE_ID_ALLOCATION_MIN + index,
    )

    expect(() =>
      allocate(['website-a'], undefined, reservedRuleIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'allocation-range-exhausted',
      }),
    )
  })

  it('prechecks capacity before fully occupied range allocation', () => {
    const reservedRuleIds = Array.from(
      { length: DNR_RULE_ID_ALLOCATION_SIZE },
      (_, index) => DNR_RULE_ID_ALLOCATION_MIN + index,
    )

    expect(() =>
      allocate(['new-website'], undefined, reservedRuleIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'allocation-range-exhausted',
      }),
    )
  })

  it('prechecks insufficient remaining capacity', () => {
    const reservedRuleIds = Array.from(
      { length: DNR_RULE_ID_ALLOCATION_SIZE - 2 },
      (_, index) => DNR_RULE_ID_ALLOCATION_MIN + index,
    )

    expect(() =>
      allocate(
        ['website-a', 'website-b', 'website-c'],
        undefined,
        reservedRuleIds,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'allocation-range-exhausted',
      }),
    )
  })

  it('returns no assignments for empty input', () => {
    expect(allocate([])).toEqual([])
  })

  it('rejects existing assignments for removed websites explicitly', () => {
    expect(() =>
      allocate(
        ['website-a'],
        [{ websiteId: 'removed-website', ruleId: 150_000 }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'existing-assignment-for-removed-website',
      }),
    )
  })

  it('rejects null existing assignment entries', () => {
    expect(() =>
      allocate(
        ['website-a'],
        [null as unknown as { websiteId: string; ruleId: number }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('rejects non-object existing assignment entries', () => {
    expect(() =>
      allocate(
        ['website-a'],
        ['not-an-object' as unknown as { websiteId: string; ruleId: number }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('rejects malformed website IDs', () => {
    for (const websiteId of ['', '   ', ' website-a', 'website-a ']) {
      expect(() =>
        allocate([websiteId]),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-input',
        }),
      )
    }
  })

  it('rejects sparse websiteIds arrays', () => {
    const websiteIds = new Array<string>(1)
    expect(() =>
      allocate(websiteIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-input',
      }),
    )
  })

  it('rejects sparse reservedRuleIds arrays', () => {
    const reservedRuleIds = new Array<number>(1)
    expect(() =>
      allocate(['website-a'], undefined, reservedRuleIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-reserved-rule-id',
      }),
    )
  })

  it('rejects sparse existingAssignments arrays', () => {
    const existingAssignments =
      new Array<{ websiteId: string; ruleId: number }>(1)
    expect(() =>
      allocate(['website-a'], existingAssignments),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('exposes typed allocation errors', () => {
    try {
      allocate(['website-a', 'website-a'])
      throw new Error('Expected allocation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(DnrRuleIdAllocationError)
      expect(error).toMatchObject({ code: 'duplicate-website-id' })
    }
  })
})
