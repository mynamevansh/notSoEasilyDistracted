export const DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION = 1 as const

export interface DnrOwnershipRegistry {
  readonly schemaVersion: typeof DNR_OWNERSHIP_REGISTRY_SCHEMA_VERSION
  readonly managedRuleIds: readonly number[]
  readonly lastConfirmedGenerationId: string
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
