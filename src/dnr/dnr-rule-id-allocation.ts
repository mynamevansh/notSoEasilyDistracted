// Project-owned DNR rule-ID namespace. This range is independent of Chrome's
// installed dynamic-rule count limit; it only bounds allocator-owned IDs.
// Lower IDs remain available to future internal namespaces, and 100,000 IDs
// provide ample bounded capacity while keeping linear probing practical.
export const DNR_RULE_ID_ALLOCATION_MIN = 100_000
export const DNR_RULE_ID_ALLOCATION_MAX = 199_999
export const DNR_RULE_ID_ALLOCATION_SIZE =
  DNR_RULE_ID_ALLOCATION_MAX - DNR_RULE_ID_ALLOCATION_MIN + 1

export interface DnrRuleIdAssignment {
  readonly targetId: string
  readonly ruleId: number
}

export interface DnrRuleIdAllocationInput {
  readonly targetIds: readonly string[]
  readonly existingAssignments?: readonly DnrRuleIdAssignment[]
  readonly reservedRuleIds?: readonly number[]
}

export type DnrRuleIdAllocationErrorCode =
  | 'invalid-input'
  | 'duplicate-target-id'
  | 'duplicate-existing-assignment'
  | 'rule-id-conflict'
  | 'invalid-existing-assignment'
  | 'invalid-reserved-rule-id'
  | 'duplicate-reserved-rule-id'
  | 'existing-assignment-for-removed-target'
  | 'allocation-range-exhausted'

export class DnrRuleIdAllocationError extends Error {
  readonly code: DnrRuleIdAllocationErrorCode

  constructor(code: DnrRuleIdAllocationErrorCode, message: string) {
    super(message)
    this.name = 'DnrRuleIdAllocationError'
    this.code = code
  }
}

function allocationError(
  code: DnrRuleIdAllocationErrorCode,
  message: string,
): DnrRuleIdAllocationError {
  return new DnrRuleIdAllocationError(code, message)
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value.trim().length > 0
  )
}

function isInAllocationRange(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DNR_RULE_ID_ALLOCATION_MIN &&
    value <= DNR_RULE_ID_ALLOCATION_MAX
  )
}

function validateTargetIds(targetIds: readonly string[]): Set<string> {
  if (!Array.isArray(targetIds)) {
    throw allocationError(
      'invalid-input',
      'targetIds must be an array.',
    )
  }

  const targetIdSet = new Set<string>()
  for (const targetId of targetIds) {
    if (!isNonEmptyString(targetId)) {
      throw allocationError(
        'invalid-input',
        'Target IDs must be non-empty strings.',
      )
    }
    if (targetIdSet.has(targetId)) {
      throw allocationError(
        'duplicate-target-id',
        `Duplicate target ID: ${targetId}.`,
      )
    }
    targetIdSet.add(targetId)
  }

  return targetIdSet
}

function validateReservedRuleIds(
  reservedRuleIds: readonly number[],
): Set<number> {
  if (!Array.isArray(reservedRuleIds)) {
    throw allocationError(
      'invalid-reserved-rule-id',
      'reservedRuleIds must be an array.',
    )
  }

  const reservedSet = new Set<number>()
  for (const ruleId of reservedRuleIds) {
    if (!isInAllocationRange(ruleId)) {
      throw allocationError(
        'invalid-reserved-rule-id',
        `Reserved rule ID ${String(ruleId)} is outside the allocation range.`,
      )
    }
    if (reservedSet.has(ruleId)) {
      throw allocationError(
        'duplicate-reserved-rule-id',
        `Duplicate reserved rule ID: ${ruleId}.`,
      )
    }
    reservedSet.add(ruleId)
  }

  return reservedSet
}

function validateExistingAssignments(
  existingAssignments: readonly DnrRuleIdAssignment[],
  targetIds: Set<string>,
  reservedRuleIds: Set<number>,
): {
  assignments: Map<string, number>
  usedRuleIds: Set<number>
} {
  if (!Array.isArray(existingAssignments)) {
    throw allocationError(
      'invalid-existing-assignment',
      'existingAssignments must be an array.',
    )
  }

  const assignments = new Map<string, number>()
  const usedRuleIds = new Set<number>()
  for (const assignment of existingAssignments) {
    if (
      !assignment ||
      typeof assignment !== 'object' ||
      !isNonEmptyString(assignment.targetId) ||
      !isInAllocationRange(assignment.ruleId)
    ) {
      throw allocationError(
        'invalid-existing-assignment',
        'An existing assignment must contain a valid target ID and rule ID.',
      )
    }

    if (!targetIds.has(assignment.targetId)) {
      throw allocationError(
        'existing-assignment-for-removed-target',
        `Existing assignment references removed target ID ${assignment.targetId}.`,
      )
    }
    if (assignments.has(assignment.targetId)) {
      throw allocationError(
        'duplicate-existing-assignment',
        `Duplicate existing assignment: ${assignment.targetId}.`,
      )
    }
    if (reservedRuleIds.has(assignment.ruleId)) {
      throw allocationError(
        'invalid-existing-assignment',
        `Existing assignment uses reserved rule ID ${assignment.ruleId}.`,
      )
    }
    if (usedRuleIds.has(assignment.ruleId)) {
      throw allocationError(
        'rule-id-conflict',
        `Rule ID ${assignment.ruleId} is assigned to multiple targets.`,
      )
    }

    assignments.set(assignment.targetId, assignment.ruleId)
    usedRuleIds.add(assignment.ruleId)
  }

  return { assignments, usedRuleIds }
}

export function hashDnrRuleTargetId(targetId: string): number {
  if (!isNonEmptyString(targetId)) {
    throw allocationError(
      'invalid-input',
      'Target IDs must be non-empty strings.',
    )
  }

  // FNV-1a-style 32-bit hash. JavaScript strings are processed as UTF-16
  // code units; charCodeAt() supplies one code unit per iteration. A changed
  // hash algorithm or encoding can change first-candidate IDs. Persisted
  // assignments are authoritative and are therefore never recalculated.
  let hash = 0x811c9dc5
  for (let index = 0; index < targetId.length; index += 1) {
    hash ^= targetId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash
}

export function allocateDnrRuleIds(
  input: DnrRuleIdAllocationInput,
): readonly DnrRuleIdAssignment[] {
  if (!input || typeof input !== 'object' || !Array.isArray(input.targetIds)) {
    throw allocationError(
      'invalid-input',
      'The allocation input must contain a targetIds array.',
    )
  }

  const targetIds = validateTargetIds(input.targetIds)
  const reservedInput =
    input.reservedRuleIds === undefined
      ? []
      : input.reservedRuleIds
  const reservedRuleIds = validateReservedRuleIds(
    reservedInput,
  )
  const existingInput =
    input.existingAssignments === undefined
      ? []
      : input.existingAssignments
  const existing = validateExistingAssignments(
    existingInput,
    targetIds,
    reservedRuleIds,
  )

  const usedRuleIds = new Set(existing.usedRuleIds)
  for (const ruleId of reservedRuleIds) {
    usedRuleIds.add(ruleId)
  }

  const assignments = new Map(existing.assignments)
  const sortedNewTargetIds = [...targetIds]
    .filter((targetId) => !assignments.has(targetId))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)

  const availableRuleIdCount =
    DNR_RULE_ID_ALLOCATION_SIZE - usedRuleIds.size
  if (availableRuleIdCount < sortedNewTargetIds.length) {
    throw allocationError(
      'allocation-range-exhausted',
      'Insufficient available DNR rule IDs remain in the allocation range.',
    )
  }

  for (const targetId of sortedNewTargetIds) {
    const hash = hashDnrRuleTargetId(targetId)
    const firstOffset =
      hash % DNR_RULE_ID_ALLOCATION_SIZE
    let allocated = false

    for (let offset = 0; offset < DNR_RULE_ID_ALLOCATION_SIZE; offset += 1) {
      const candidate =
        DNR_RULE_ID_ALLOCATION_MIN +
        ((firstOffset + offset) % DNR_RULE_ID_ALLOCATION_SIZE)
      if (!usedRuleIds.has(candidate)) {
        assignments.set(targetId, candidate)
        usedRuleIds.add(candidate)
        allocated = true
        break
      }
    }

    if (!allocated) {
      throw allocationError(
        'allocation-range-exhausted',
        'No available DNR rule IDs remain in the allocation range.',
      )
    }
  }

  return [...assignments.entries()]
    .map(([targetId, ruleId]) => ({ targetId, ruleId }))
    .sort((left, right) =>
      left.targetId < right.targetId
        ? -1
        : left.targetId > right.targetId
          ? 1
          : 0
    )
}
