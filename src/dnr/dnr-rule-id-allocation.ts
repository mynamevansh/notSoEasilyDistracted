// Project-owned DNR rule-ID namespace. This range is independent of Chrome's
// installed dynamic-rule count limit; it only bounds allocator-owned IDs.
// Lower IDs remain available to future internal namespaces, and 100,000 IDs
// provide ample bounded capacity while keeping linear probing practical.
export const DNR_RULE_ID_ALLOCATION_MIN = 100_000
export const DNR_RULE_ID_ALLOCATION_MAX = 199_999
export const DNR_RULE_ID_ALLOCATION_SIZE =
  DNR_RULE_ID_ALLOCATION_MAX - DNR_RULE_ID_ALLOCATION_MIN + 1

export interface DnrRuleIdAssignment {
  readonly websiteId: string
  readonly ruleId: number
}

export interface DnrRuleIdAllocationInput {
  readonly websiteIds: readonly string[]
  readonly existingAssignments?: readonly DnrRuleIdAssignment[]
  readonly reservedRuleIds?: readonly number[]
}

export type DnrRuleIdAllocationErrorCode =
  | 'invalid-input'
  | 'duplicate-website-id'
  | 'duplicate-existing-assignment'
  | 'rule-id-conflict'
  | 'invalid-existing-assignment'
  | 'invalid-reserved-rule-id'
  | 'duplicate-reserved-rule-id'
  | 'existing-assignment-for-removed-website'
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

function validateWebsiteIds(websiteIds: readonly string[]): Set<string> {
  if (!Array.isArray(websiteIds)) {
    throw allocationError(
      'invalid-input',
      'websiteIds must be an array.',
    )
  }

  const websiteIdSet = new Set<string>()
  for (const websiteId of websiteIds) {
    if (!isNonEmptyString(websiteId)) {
      throw allocationError(
        'invalid-input',
        'Website IDs must be non-empty strings.',
      )
    }
    if (websiteIdSet.has(websiteId)) {
      throw allocationError(
        'duplicate-website-id',
        `Duplicate website ID: ${websiteId}.`,
      )
    }
    websiteIdSet.add(websiteId)
  }

  return websiteIdSet
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
  websiteIds: Set<string>,
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
      !isNonEmptyString(assignment.websiteId) ||
      !isInAllocationRange(assignment.ruleId)
    ) {
      throw allocationError(
        'invalid-existing-assignment',
        'An existing assignment must contain a valid website ID and rule ID.',
      )
    }

    if (!websiteIds.has(assignment.websiteId)) {
      throw allocationError(
        'existing-assignment-for-removed-website',
        `Existing assignment references removed website ID ${assignment.websiteId}.`,
      )
    }
    if (assignments.has(assignment.websiteId)) {
      throw allocationError(
        'duplicate-existing-assignment',
        `Duplicate existing assignment: ${assignment.websiteId}.`,
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
        `Rule ID ${assignment.ruleId} is assigned to multiple websites.`,
      )
    }

    assignments.set(assignment.websiteId, assignment.ruleId)
    usedRuleIds.add(assignment.ruleId)
  }

  return { assignments, usedRuleIds }
}

export function hashDnrRuleWebsiteId(websiteId: string): number {
  if (!isNonEmptyString(websiteId)) {
    throw allocationError(
      'invalid-input',
      'Website IDs must be non-empty strings.',
    )
  }

  // FNV-1a-style 32-bit hash. JavaScript strings are processed as UTF-16
  // code units; charCodeAt() supplies one code unit per iteration. A changed
  // hash algorithm or encoding can change first-candidate IDs. Persisted
  // assignments are authoritative and are therefore never recalculated.
  let hash = 0x811c9dc5
  for (let index = 0; index < websiteId.length; index += 1) {
    hash ^= websiteId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash
}

export function allocateDnrRuleIds(
  input: DnrRuleIdAllocationInput,
): readonly DnrRuleIdAssignment[] {
  if (!input || typeof input !== 'object' || !Array.isArray(input.websiteIds)) {
    throw allocationError(
      'invalid-input',
      'The allocation input must contain a websiteIds array.',
    )
  }

  const websiteIds = validateWebsiteIds(input.websiteIds)
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
    websiteIds,
    reservedRuleIds,
  )

  const usedRuleIds = new Set(existing.usedRuleIds)
  for (const ruleId of reservedRuleIds) {
    usedRuleIds.add(ruleId)
  }

  const assignments = new Map(existing.assignments)
  const sortedNewWebsiteIds = [...websiteIds]
    .filter((websiteId) => !assignments.has(websiteId))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)

  const availableRuleIdCount =
    DNR_RULE_ID_ALLOCATION_SIZE - usedRuleIds.size
  if (availableRuleIdCount < sortedNewWebsiteIds.length) {
    throw allocationError(
      'allocation-range-exhausted',
      'Insufficient available DNR rule IDs remain in the allocation range.',
    )
  }

  for (const websiteId of sortedNewWebsiteIds) {
    const hash = hashDnrRuleWebsiteId(websiteId)
    const firstOffset =
      hash % DNR_RULE_ID_ALLOCATION_SIZE
    let allocated = false

    for (let offset = 0; offset < DNR_RULE_ID_ALLOCATION_SIZE; offset += 1) {
      const candidate =
        DNR_RULE_ID_ALLOCATION_MIN +
        ((firstOffset + offset) % DNR_RULE_ID_ALLOCATION_SIZE)
      if (!usedRuleIds.has(candidate)) {
        assignments.set(websiteId, candidate)
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
    .map(([websiteId, ruleId]) => ({ websiteId, ruleId }))
    .sort((left, right) =>
      left.websiteId < right.websiteId
        ? -1
        : left.websiteId > right.websiteId
          ? 1
          : 0
    )
}
