import { describe, expect, it } from 'vitest'
import {
  DNR_RULE_ID_ALLOCATION_MAX,
  DNR_RULE_ID_ALLOCATION_MIN,
  DNR_RULE_ID_ALLOCATION_SIZE,
  DnrRuleIdAllocationError,
  allocateDnrRuleIds,
  hashDnrRuleTargetId,
} from '../src/dnr/dnr-rule-id-allocation.ts'

function allocate(
  targetIds: readonly string[],
  existingAssignments?: readonly {
    readonly targetId: string
    readonly ruleId: number
  }[],
  reservedRuleIds?: readonly number[],
) {
  return allocateDnrRuleIds({
    targetIds,
    existingAssignments,
    reservedRuleIds,
  })
}

describe('allocateDnrRuleIds', () => {
  it('uses the documented FNV-1a-style hash vectors', () => {
    expect(hashDnrRuleTargetId('a')).toBe(0xe40c292c)
    expect(hashDnrRuleTargetId('😀')).toBe(0xcb31c4b8)
  })

  it('allocates deterministically', () => {
    expect(allocate(['target-a', 'target-b'])).toEqual(
      allocate(['target-a', 'target-b']),
    )
  })

  it('does not change allocations when target input order changes', () => {
    expect(allocate(['target-b', 'target-a'])).toEqual(
      allocate(['target-a', 'target-b']),
    )
  })

  it('preserves every valid existing assignment unchanged', () => {
    const result = allocate(
      ['target-a', 'target-b'],
      [
        { targetId: 'target-b', ruleId: 175_000 },
      ],
    )

    expect(result).toContainEqual({
      targetId: 'target-b',
      ruleId: 175_000,
    })
  })

  it('adds a third target without changing previous assignments', () => {
    const first = allocate(
      ['target-a', 'target-b'],
    )
    const second = allocate(
      ['target-a', 'target-b', 'target-c'],
      first,
    )

    for (const assignment of first) {
      expect(second).toContainEqual(assignment)
    }
  })

  it('preserves two original assignments when a third hash candidate collides', () => {
    const originalAssignments = allocate(['target-a', 'target-b'])
    const thirdTargetId = 'collision-third-230'
    const thirdCandidate =
      DNR_RULE_ID_ALLOCATION_MIN +
      (hashDnrRuleTargetId(thirdTargetId) %
        DNR_RULE_ID_ALLOCATION_SIZE)

    expect(
      originalAssignments.some(
        (assignment) => assignment.ruleId === thirdCandidate,
      ),
    ).toBe(true)

    const second = allocate(
      ['target-a', 'target-b', thirdTargetId],
      originalAssignments,
    )

    for (const assignment of originalAssignments) {
      expect(second).toContainEqual(assignment)
    }
    const thirdAssignment = second.find(
      (assignment) => assignment.targetId === thirdTargetId,
    )
    expect(thirdAssignment).toBeDefined()
    expect(thirdAssignment?.ruleId).not.toBe(thirdCandidate)
  })

  it('resolves collisions deterministically with linear probing', () => {
    const targetId = 'collision-target'
    const firstOffset =
      hashDnrRuleTargetId(targetId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const occupiedRuleId =
      DNR_RULE_ID_ALLOCATION_MIN + firstOffset
    const nextRuleId =
      DNR_RULE_ID_ALLOCATION_MIN +
      ((firstOffset + 1) % DNR_RULE_ID_ALLOCATION_SIZE)

    const result = allocate(
      [targetId, 'existing-target'],
      [{ targetId: 'existing-target', ruleId: occupiedRuleId }],
    )

    expect(result).toContainEqual({
      targetId,
      ruleId: nextRuleId,
    })
  })

  it('skips reserved IDs', () => {
    const targetId = 'reserved-target'
    const firstOffset =
      hashDnrRuleTargetId(targetId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const reservedRuleId =
      DNR_RULE_ID_ALLOCATION_MIN + firstOffset

    const result = allocate(
      [targetId],
      undefined,
      [reservedRuleId],
    )

    expect(result).toEqual([
      {
        targetId,
        ruleId:
          DNR_RULE_ID_ALLOCATION_MIN +
          ((firstOffset + 1) % DNR_RULE_ID_ALLOCATION_SIZE),
      },
    ])
  })

  it('wraps linear probing from the upper boundary to the lower boundary', () => {
    const targetId = 'wrap-906'
    const firstOffset =
      hashDnrRuleTargetId(targetId) %
      DNR_RULE_ID_ALLOCATION_SIZE
    const reservedRuleIds = Array.from(
      { length: DNR_RULE_ID_ALLOCATION_MAX - (DNR_RULE_ID_ALLOCATION_MIN + firstOffset) + 1 },
      (_, index) => DNR_RULE_ID_ALLOCATION_MIN + firstOffset + index,
    )

    const result = allocate(
      [targetId],
      undefined,
      reservedRuleIds,
    )

    expect(result).toEqual([
      {
        targetId,
        ruleId: DNR_RULE_ID_ALLOCATION_MIN,
      },
    ])
  })

  it('rejects null existingAssignments', () => {
    expect(() =>
      allocateDnrRuleIds({
        targetIds: ['target-a'],
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
        targetIds: ['target-a'],
        reservedRuleIds: null as unknown as [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-reserved-rule-id',
      }),
    )
  })

  it('rejects duplicate target IDs', () => {
    expect(() =>
      allocate(['target-a', 'target-a']),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-target-id',
      }),
    )
  })

  it('rejects duplicate existing assignments', () => {
    expect(() =>
      allocate(
        ['target-a'],
        [
          { targetId: 'target-a', ruleId: 150_000 },
          { targetId: 'target-a', ruleId: 150_001 },
        ],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-existing-assignment',
      }),
    )
  })

  it('rejects the same rule ID assigned to different targets', () => {
    expect(() =>
      allocate(
        ['target-a', 'target-b'],
        [
          { targetId: 'target-a', ruleId: 150_000 },
          { targetId: 'target-b', ruleId: 150_000 },
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
          ['target-a'],
          [{ targetId: 'target-a', ruleId }],
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
        allocate(['target-a'], undefined, [ruleId]),
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
        ['target-a'],
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
      allocate(['target-a'], undefined, reservedRuleIds),
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
      allocate(['new-target'], undefined, reservedRuleIds),
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
        ['target-a', 'target-b', 'target-c'],
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

  it('rejects existing assignments for removed targets explicitly', () => {
    expect(() =>
      allocate(
        ['target-a'],
        [{ targetId: 'removed-target', ruleId: 150_000 }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'existing-assignment-for-removed-target',
      }),
    )
  })

  it('rejects null existing assignment entries', () => {
    expect(() =>
      allocate(
        ['target-a'],
        [null as unknown as { targetId: string; ruleId: number }],
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
        ['target-a'],
        ['not-an-object' as unknown as { targetId: string; ruleId: number }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('rejects malformed target IDs', () => {
    for (const targetId of ['', '   ', ' target-a', 'target-a ']) {
      expect(() =>
        allocate([targetId]),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-input',
        }),
      )
    }
  })

  it('rejects sparse targetIds arrays', () => {
    const targetIds = new Array<string>(1)
    expect(() =>
      allocate(targetIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-input',
      }),
    )
  })

  it('rejects sparse reservedRuleIds arrays', () => {
    const reservedRuleIds = new Array<number>(1)
    expect(() =>
      allocate(['target-a'], undefined, reservedRuleIds),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-reserved-rule-id',
      }),
    )
  })

  it('rejects sparse existingAssignments arrays', () => {
    const existingAssignments =
      new Array<{ targetId: string; ruleId: number }>(1)
    expect(() =>
      allocate(['target-a'], existingAssignments),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-existing-assignment',
      }),
    )
  })

  it('exposes typed allocation errors', () => {
    try {
      allocate(['target-a', 'target-a'])
      throw new Error('Expected allocation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(DnrRuleIdAllocationError)
      expect(error).toMatchObject({ code: 'duplicate-target-id' })
    }
  })
})
