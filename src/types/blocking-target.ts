export type BlockingTargetScope =
  | 'hostname'
  | 'registrable-domain'
  | 'service'

export type BlockingTargetSource =
  | 'manual'
  | 'catalogue'

export interface BlockingTarget {
  readonly id: string
  readonly name: string
  readonly scope: BlockingTargetScope
  readonly domains: readonly string[]
  readonly isEnabled: boolean
  readonly source: BlockingTargetSource
  readonly catalogueId?: string
  readonly createdAt: number
  readonly updatedAt: number
}

export type BlockingTargetValidationErrorCode =
  | 'invalid-target'
  | 'invalid-id'
  | 'invalid-name'
  | 'invalid-scope'
  | 'invalid-source'
  | 'invalid-domains'
  | 'invalid-enabled-state'
  | 'invalid-timestamps'
  | 'invalid-catalogue-id'

export class BlockingTargetValidationError extends Error {
  readonly code: BlockingTargetValidationErrorCode

  constructor(
    code: BlockingTargetValidationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BlockingTargetValidationError'
    this.code = code
  }
}

function invalid(
  code: BlockingTargetValidationErrorCode,
  message: string,
): BlockingTargetValidationError {
  return new BlockingTargetValidationError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value.trim().length > 0
  )
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  )
}

function isBlockingTargetScope(value: unknown): value is BlockingTargetScope {
  return (
    value === 'hostname' ||
    value === 'registrable-domain' ||
    value === 'service'
  )
}

function isBlockingTargetSource(value: unknown): value is BlockingTargetSource {
  return value === 'manual' || value === 'catalogue'
}

export function validateBlockingTarget(value: unknown): BlockingTarget {
  if (!isRecord(value)) {
    throw invalid('invalid-target', 'Blocking target must be a non-null object.')
  }

  if (!isNonEmptyString(value.id)) {
    throw invalid(
      'invalid-id',
      'Blocking target id must be a non-empty, trimmed string.',
    )
  }

  if (!isNonEmptyString(value.name)) {
    throw invalid(
      'invalid-name',
      'Blocking target name must be a non-empty, trimmed string.',
    )
  }

  if (!isBlockingTargetScope(value.scope)) {
    throw invalid(
      'invalid-scope',
      'Blocking target scope is not supported.',
    )
  }

  if (!isBlockingTargetSource(value.source)) {
    throw invalid(
      'invalid-source',
      'Blocking target source is not supported.',
    )
  }

  if (!Array.isArray(value.domains) || value.domains.length === 0) {
    throw invalid(
      'invalid-domains',
      'Blocking target domains must be a non-empty array.',
    )
  }

  if (
    value.scope !== 'service' &&
    value.domains.length !== 1
  ) {
    throw invalid(
      'invalid-domains',
      `${value.scope} blocking targets must contain exactly one domain.`,
    )
  }

  const domains = new Set<string>()
  for (let index = 0; index < value.domains.length; index += 1) {
    const domain = value.domains[index]
    if (!isNonEmptyString(domain)) {
      throw invalid(
        'invalid-domains',
        'Blocking target domains must contain non-empty, trimmed strings.',
      )
    }
    if (domains.has(domain)) {
      throw invalid(
        'invalid-domains',
        `Duplicate blocking target domain: ${domain}.`,
      )
    }
    domains.add(domain)
  }

  if (typeof value.isEnabled !== 'boolean') {
    throw invalid(
      'invalid-enabled-state',
      'Blocking target isEnabled must be a boolean.',
    )
  }

  if (
    !isFiniteNonNegativeNumber(value.createdAt) ||
    !isFiniteNonNegativeNumber(value.updatedAt)
  ) {
    throw invalid(
      'invalid-timestamps',
      'Blocking target timestamps must be finite, non-negative numbers.',
    )
  }

  if (value.updatedAt < value.createdAt) {
    throw invalid(
      'invalid-timestamps',
      'Blocking target updatedAt must not be earlier than createdAt.',
    )
  }

  if (value.source === 'catalogue') {
    if (!isNonEmptyString(value.catalogueId)) {
      throw invalid(
        'invalid-catalogue-id',
        'A catalogue blocking target must contain a valid catalogueId.',
      )
    }
  } else if (
    value.catalogueId !== undefined &&
    !isNonEmptyString(value.catalogueId)
  ) {
    throw invalid(
      'invalid-catalogue-id',
      'Blocking target catalogueId must be a non-empty, trimmed string when provided.',
    )
  }

  return value as unknown as BlockingTarget
}
