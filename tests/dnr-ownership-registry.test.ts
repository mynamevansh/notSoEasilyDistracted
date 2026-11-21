import { describe, expect, it } from 'vitest'
import {
  DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION,
  DnrOwnershipRegistryValidationError,
  validateDnrOwnershipRegistry,
} from '../src/types/dnr-synchronization.ts'

function validRegistry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION,
    assignments: [],
    managedRuleIds: [],
    lastConfirmedGenerationId: null,
    ...overrides,
  }
}

describe('validateDnrOwnershipRegistry', () => {
  it('accepts an empty v2 registry', () => {
    expect(validateDnrOwnershipRegistry(validRegistry())).toEqual(validRegistry())
  })

  it('accepts valid target assignments', () => {
    const registry = validRegistry({
      assignments: [{ targetId: 'target-a', ruleId: 150_000 }],
      managedRuleIds: [150_000],
    })
    expect(validateDnrOwnershipRegistry(registry)).toEqual(registry)
  })

  it('accepts multiple target assignments', () => {
    const registry = validRegistry({
      assignments: [
        { targetId: 'target-a', ruleId: 150_000 },
        { targetId: 'target-b', ruleId: 150_001 },
      ],
      managedRuleIds: [150_000, 150_001],
    })
    expect(validateDnrOwnershipRegistry(registry)).toEqual(registry)
  })

  it('accepts positive legacy managed IDs below the allocator range', () => {
    const registry = validRegistry({
      managedRuleIds: [101, 205, 150_000],
    })
    expect(validateDnrOwnershipRegistry(registry)).toEqual(registry)
  })

  it('accepts an allocator-range assignment when it is owned', () => {
    const registry = validRegistry({
      assignments: [{ targetId: 'target-a', ruleId: 150_000 }],
      managedRuleIds: [101, 205, 150_000],
    })
    expect(validateDnrOwnershipRegistry(registry)).toEqual(registry)
  })

  it('rejects an assignment outside the allocator range even when it is owned', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      assignments: [{ targetId: 'target-a', ruleId: 101 }],
      managedRuleIds: [101],
    }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
  })

  it('preserves additional managed IDs without assignments', () => {
    const registry = validRegistry({
      assignments: [{ targetId: 'target-a', ruleId: 150_000 }],
      managedRuleIds: [150_000, 175_000],
    })
    expect(validateDnrOwnershipRegistry(registry)).toBe(registry)
  })

  it('preserves the confirmed generation ID', () => {
    const registry = validRegistry({
      lastConfirmedGenerationId: 'generation-123',
    })
    expect(validateDnrOwnershipRegistry(registry).lastConfirmedGenerationId)
      .toBe('generation-123')
  })

  it('preserves existing assignments unchanged', () => {
    const assignments = [
      { targetId: 'target-b', ruleId: 150_001 },
      { targetId: 'target-a', ruleId: 150_000 },
    ]
    const registry = validRegistry({
      assignments,
      managedRuleIds: [150_000, 150_001],
    })
    expect(validateDnrOwnershipRegistry(registry).assignments).toBe(assignments)
  })

  it('rejects missing assignments', () => {
    expect(() => validateDnrOwnershipRegistry({
      schemaVersion: 2,
      managedRuleIds: [],
      lastConfirmedGenerationId: null,
    })).toThrowError(expect.objectContaining({ code: 'missing-assignments' }))
  })

  it('rejects missing managed IDs', () => {
    expect(() => validateDnrOwnershipRegistry({
      schemaVersion: 2,
      assignments: [],
      lastConfirmedGenerationId: null,
    })).toThrowError(expect.objectContaining({ code: 'missing-managed-rule-ids' }))
  })

  it('rejects duplicate target IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      assignments: [
        { targetId: 'target-a', ruleId: 150_000 },
        { targetId: 'target-a', ruleId: 150_001 },
      ],
      managedRuleIds: [150_000, 150_001],
    }))).toThrowError(expect.objectContaining({ code: 'duplicate-target-id' }))
  })

  it('rejects duplicate assignment rule IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      assignments: [
        { targetId: 'target-a', ruleId: 150_000 },
        { targetId: 'target-b', ruleId: 150_000 },
      ],
      managedRuleIds: [150_000],
    }))).toThrowError(expect.objectContaining({ code: 'duplicate-assignment-rule-id' }))
  })

  it('rejects duplicate managed rule IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      managedRuleIds: [150_000, 150_000],
    }))).toThrowError(expect.objectContaining({ code: 'duplicate-managed-rule-id' }))
  })

  it('rejects assignment rule IDs absent from managed IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      assignments: [{ targetId: 'target-a', ruleId: 150_000 }],
      managedRuleIds: [150_001],
    }))).toThrowError(expect.objectContaining({ code: 'assignment-not-owned' }))
  })

  it('rejects invalid target IDs', () => {
    for (const targetId of ['', '   ', ' target-a', 'target-a ', 123]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        assignments: [{ targetId, ruleId: 150_000 }],
        managedRuleIds: [150_000],
      }))).toThrowError(expect.objectContaining({ code: 'invalid-target-id' }))
    }
  })

  it('rejects invalid rule IDs', () => {
    for (const ruleId of [0, -1, 1.5, Number.NaN, Infinity, 99_999, 200_000]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        assignments: [{ targetId: 'target-a', ruleId }],
        managedRuleIds: [ruleId],
      }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
    }
  })

  it('rejects zero and negative managed IDs', () => {
    for (const ruleId of [0, -1]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        managedRuleIds: [ruleId],
      }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
    }
  })

  it('rejects fractional managed IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      managedRuleIds: [150_000.5],
    }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
  })

  it('rejects NaN and Infinity managed IDs', () => {
    for (const ruleId of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        managedRuleIds: [ruleId],
      }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
    }
  })

  it('rejects unsafe integer managed IDs', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      managedRuleIds: [Number.MAX_SAFE_INTEGER + 1],
    }))).toThrowError(expect.objectContaining({ code: 'invalid-rule-id' }))
  })

  it('rejects sparse assignment arrays', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      assignments: new Array(1),
      managedRuleIds: [],
    }))).toThrowError(expect.objectContaining({ code: 'invalid-assignment' }))
  })

  it('rejects sparse managed ID arrays', () => {
    expect(() => validateDnrOwnershipRegistry(validRegistry({
      managedRuleIds: new Array(1),
    }))).toThrowError(expect.objectContaining({ code: 'missing-managed-rule-ids' }))
  })

  it('rejects malformed assignment objects', () => {
    for (const assignment of [
      null,
      'target-a',
      {},
      { targetId: 'target-a' },
      { ruleId: 150_000 },
      { targetId: 'target-a', ruleId: 150_000, enabled: true },
    ]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        assignments: [assignment],
        managedRuleIds: [150_000],
      }))).toThrowError(expect.objectContaining({ code: 'invalid-assignment' }))
    }
  })

  it('rejects unsupported schema versions', () => {
    for (const schemaVersion of [1, 3, '2', null]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        schemaVersion,
      }))).toThrowError(expect.objectContaining({ code: 'invalid-schema-version' }))
    }
  })

  it('rejects invalid generation metadata', () => {
    for (const lastConfirmedGenerationId of [
      123,
      '',
      '   ',
      ' generation',
      'generation ',
      undefined,
    ]) {
      expect(() => validateDnrOwnershipRegistry(validRegistry({
        lastConfirmedGenerationId,
      }))).toThrowError(expect.objectContaining({ code: 'invalid-generation-id' }))
    }
  })

  it('exposes typed registry validation errors', () => {
    try {
      validateDnrOwnershipRegistry(validRegistry({ schemaVersion: 1 }))
      throw new Error('Expected registry validation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(DnrOwnershipRegistryValidationError)
      expect(error).toMatchObject({ code: 'invalid-schema-version' })
    }
  })

  it('does not remove unassigned or removed-target state', () => {
    const registry = validRegistry({
      assignments: [],
      managedRuleIds: [150_000, 150_001],
      lastConfirmedGenerationId: 'old-generation',
    })
    expect(validateDnrOwnershipRegistry(registry).managedRuleIds)
      .toEqual([150_000, 150_001])
  })
})
