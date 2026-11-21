import {
  DNR_RULE_ID_ALLOCATION_MAX,
  DNR_RULE_ID_ALLOCATION_MIN,
  type DnrRuleIdAssignment,
} from '../dnr/dnr-rule-id-allocation.ts'

export const DNR_OWNERSHIP_REGISTRY_V1_SCHEMA_VERSION = 1 as const
export const DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION = 2 as const

export interface DnrOwnershipRegistryV1 {
  readonly schemaVersion: typeof DNR_OWNERSHIP_REGISTRY_V1_SCHEMA_VERSION
  readonly managedRuleIds: readonly number[]
  readonly lastConfirmedGenerationId: string
}

export interface DnrOwnershipRegistry {
  readonly schemaVersion: typeof DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION
  readonly assignments: readonly DnrRuleIdAssignment[]
  readonly managedRuleIds: readonly number[]
  readonly lastConfirmedGenerationId: string | null
}

export type DnrOwnershipRegistryRecord =
  | DnrOwnershipRegistryV1
  | DnrOwnershipRegistry

export type DnrOwnershipRegistryValidationErrorCode =
  | 'invalid-registry'
  | 'invalid-schema-version'
  | 'missing-assignments'
  | 'missing-managed-rule-ids'
  | 'invalid-assignment'
  | 'invalid-target-id'
  | 'invalid-rule-id'
  | 'duplicate-target-id'
  | 'duplicate-assignment-rule-id'
  | 'duplicate-managed-rule-id'
  | 'assignment-not-owned'
  | 'invalid-generation-id'

export class DnrOwnershipRegistryValidationError extends Error {
  readonly code: DnrOwnershipRegistryValidationErrorCode

  constructor(
    code: DnrOwnershipRegistryValidationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DnrOwnershipRegistryValidationError'
    this.code = code
  }
}

function invalid(
  code: DnrOwnershipRegistryValidationErrorCode,
  message: string,
): DnrOwnershipRegistryValidationError {
  return new DnrOwnershipRegistryValidationError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyTargetId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value.trim().length > 0
  )
}

function isValidManagedRuleId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1
  )
}

function isValidAssignmentRuleId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DNR_RULE_ID_ALLOCATION_MIN &&
    value <= DNR_RULE_ID_ALLOCATION_MAX
  )
}

function isValidGenerationId(value: unknown): value is string | null {
  return (
    value === null ||
    (
      typeof value === 'string' &&
      value.length > 0 &&
      value.trim() === value &&
      value.trim().length > 0
    )
  )
}

export function validateDnrOwnershipRegistry(
  value: unknown,
): DnrOwnershipRegistry {
  if (!isRecord(value)) {
    throw invalid(
      'invalid-registry',
      'DNR ownership registry must be a non-null object.',
    )
  }

  if (value.schemaVersion !== DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION) {
    throw invalid(
      'invalid-schema-version',
      'DNR ownership registry schemaVersion must be 2.',
    )
  }

  if (!Array.isArray(value.assignments)) {
    throw invalid(
      'missing-assignments',
      'DNR ownership registry assignments must be an array.',
    )
  }

  if (!Array.isArray(value.managedRuleIds)) {
    throw invalid(
      'missing-managed-rule-ids',
      'DNR ownership registry managedRuleIds must be an array.',
    )
  }

  if (!isValidGenerationId(value.lastConfirmedGenerationId)) {
    throw invalid(
      'invalid-generation-id',
      'DNR ownership registry lastConfirmedGenerationId must be null or a non-empty string.',
    )
  }

  const managedRuleIds = new Set<number>()
  for (let index = 0; index < value.managedRuleIds.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value.managedRuleIds, index)) {
      throw invalid(
        'missing-managed-rule-ids',
        'DNR ownership registry managedRuleIds must not contain sparse entries.',
      )
    }

    const ruleId = value.managedRuleIds[index]
    if (!isValidManagedRuleId(ruleId)) {
      throw invalid(
        'invalid-rule-id',
        `Managed rule ID ${String(ruleId)} is invalid.`,
      )
    }
    if (managedRuleIds.has(ruleId)) {
      throw invalid(
        'duplicate-managed-rule-id',
        `Duplicate managed rule ID: ${ruleId}.`,
      )
    }
    managedRuleIds.add(ruleId)
  }

  const targetIds = new Set<string>()
  const assignmentRuleIds = new Set<number>()
  for (let index = 0; index < value.assignments.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value.assignments, index)) {
      throw invalid(
        'invalid-assignment',
        'DNR ownership registry assignments must not contain sparse entries.',
      )
    }

    const assignment = value.assignments[index]
    if (
      !isRecord(assignment) ||
      Object.keys(assignment).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(assignment, 'targetId') ||
      !Object.prototype.hasOwnProperty.call(assignment, 'ruleId')
    ) {
      throw invalid(
        'invalid-assignment',
        'Each DNR ownership assignment must contain only targetId and ruleId.',
      )
    }

    if (!isNonEmptyTargetId(assignment.targetId)) {
      throw invalid(
        'invalid-target-id',
        'DNR ownership assignment targetId must be a non-empty string.',
      )
    }

    if (!isValidAssignmentRuleId(assignment.ruleId)) {
      throw invalid(
        'invalid-rule-id',
        `Assignment rule ID ${String(assignment.ruleId)} is invalid.`,
      )
    }

    if (targetIds.has(assignment.targetId)) {
      throw invalid(
        'duplicate-target-id',
        `Duplicate assignment target ID: ${assignment.targetId}.`,
      )
    }
    if (assignmentRuleIds.has(assignment.ruleId)) {
      throw invalid(
        'duplicate-assignment-rule-id',
        `Duplicate assignment rule ID: ${assignment.ruleId}.`,
      )
    }
    if (!managedRuleIds.has(assignment.ruleId)) {
      throw invalid(
        'assignment-not-owned',
        `Assignment rule ID ${assignment.ruleId} is not present in managedRuleIds.`,
      )
    }

    targetIds.add(assignment.targetId)
    assignmentRuleIds.add(assignment.ruleId)
  }

  return value as unknown as DnrOwnershipRegistry
}

export interface PendingDnrSynchronization {
  readonly generationId: string
  readonly previousConfirmedManagedRuleIds: readonly number[]
  readonly desiredManagedRuleIds: readonly number[]
}

export type DnrSynchronizationErrorCode =
  | 'storage-failure'
  | 'dnr-api-failure'
  | 'quota-exceeded'
  | 'verification-failure'
  | 'invalid-ownership-registry'
  | 'missing-ownership-registry'
  | 'recovery-required'

export interface DnrSynchronizationError {
  readonly code: DnrSynchronizationErrorCode
  readonly message: string
  readonly cause?: unknown
}

export interface DnrDesiredState {
  readonly generationId: string
  readonly managedRuleIds: readonly number[]
}

export interface DnrConfirmedInstalledState {
  readonly generationId: string
  readonly managedRuleIds: readonly number[]
}

export type DnrSynchronizationStatus =
  | 'synchronized'
  | 'failed'
  | 'recovery-required'

export interface DnrUnknownInstalledState {
  readonly generationId: null
  readonly managedRuleIds: null
}

export type DnrInstalledState =
  | DnrConfirmedInstalledState
  | DnrUnknownInstalledState

export interface DnrSynchronizationSuccess {
  readonly status: 'synchronized'
  readonly desired: DnrDesiredState
  readonly installed: DnrConfirmedInstalledState
}

export interface DnrSynchronizationFailure {
  readonly status: 'failed'
  readonly desired: DnrDesiredState
  readonly installed: DnrInstalledState
  readonly error: DnrSynchronizationError
}

export interface DnrSynchronizationRecoveryRequired {
  readonly status: 'recovery-required'
  readonly desired: DnrDesiredState
  readonly installed: DnrInstalledState
  readonly pending: PendingDnrSynchronization
  readonly error: DnrSynchronizationError
}

export type DnrSynchronizationResult =
  | DnrSynchronizationSuccess
  | DnrSynchronizationFailure
  | DnrSynchronizationRecoveryRequired
