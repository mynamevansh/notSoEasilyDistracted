import { normalizeDomain } from '../engines/blocking/domain-normalizer.ts'

export type ServiceCatalogueVerificationStatus = 'verified'

export type ServiceCatalogueEvidenceSource =
  | 'official-documentation'
  | 'manual-review'

export interface ServiceCatalogueEvidence {
  readonly source: ServiceCatalogueEvidenceSource
  readonly reference?: string
  readonly reviewedAt: number
}

export interface ServiceCatalogueDomain {
  readonly domain: string
  readonly evidence: readonly ServiceCatalogueEvidence[]
}

export interface ServiceCatalogueEntry {
  readonly id: string
  readonly name: string
  readonly domains: readonly ServiceCatalogueDomain[]
  readonly verificationStatus: ServiceCatalogueVerificationStatus
}

export interface ServiceCatalogue {
  readonly schemaVersion: 1
  readonly catalogueVersion: number
  readonly updatedAt: number
  readonly services: readonly ServiceCatalogueEntry[]
}

export type ServiceCatalogueValidationErrorCode =
  | 'invalid-catalogue'
  | 'invalid-entry'
  | 'invalid-id'
  | 'invalid-name'
  | 'invalid-verification-status'
  | 'invalid-domains'
  | 'duplicate-domain'
  | 'invalid-evidence'
  | 'invalid-reference'
  | 'invalid-timestamps'
  | 'invalid-schema-version'
  | 'invalid-catalogue-version'
  | 'duplicate-service-id'

export class ServiceCatalogueValidationError extends Error {
  readonly code: ServiceCatalogueValidationErrorCode

  constructor(
    code: ServiceCatalogueValidationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceCatalogueValidationError'
    this.code = code
  }
}

function invalid(
  code: ServiceCatalogueValidationErrorCode,
  message: string,
): ServiceCatalogueValidationError {
  return new ServiceCatalogueValidationError(code, message)
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

function isEvidenceSource(
  value: unknown,
): value is ServiceCatalogueEvidenceSource {
  return (
    value === 'official-documentation' ||
    value === 'manual-review'
  )
}

function validateEvidence(
  value: unknown,
): void {
  if (!isRecord(value)) {
    throw invalid(
      'invalid-evidence',
      'Catalogue evidence must be a non-null object.',
    )
  }

  if (!isEvidenceSource(value.source)) {
    throw invalid(
      'invalid-evidence',
      'Catalogue evidence source is not supported.',
    )
  }

  if (
    value.source === 'official-documentation' &&
    !isNonEmptyString(value.reference)
  ) {
    throw invalid(
      'invalid-reference',
      'Official-documentation evidence requires a valid reference.',
    )
  }

  if (
    value.reference !== undefined &&
    !isNonEmptyString(value.reference)
  ) {
    throw invalid(
      'invalid-reference',
      'Catalogue evidence reference must be a non-empty, trimmed string when provided.',
    )
  }

  if (!isFiniteNonNegativeNumber(value.reviewedAt)) {
    throw invalid(
      'invalid-timestamps',
      'Evidence reviewedAt must be a finite, non-negative number.',
    )
  }
}

export function validateServiceCatalogueEntry(
  value: unknown,
): ServiceCatalogueEntry {
  if (!isRecord(value)) {
    throw invalid(
      'invalid-entry',
      'Service catalogue entry must be a non-null object.',
    )
  }

  if (!isNonEmptyString(value.id)) {
    throw invalid(
      'invalid-id',
      'Service catalogue entry id must be a non-empty, trimmed string.',
    )
  }

  if (!isNonEmptyString(value.name)) {
    throw invalid(
      'invalid-name',
      'Service catalogue entry name must be a non-empty, trimmed string.',
    )
  }

  if (value.verificationStatus !== 'verified') {
    throw invalid(
      'invalid-verification-status',
      'Service catalogue verification status must be verified.',
    )
  }

  if (!Array.isArray(value.domains) || value.domains.length === 0) {
    throw invalid(
      'invalid-domains',
      'Service catalogue domains must be a non-empty array.',
    )
  }

  const domains = new Set<string>()
  for (let index = 0; index < value.domains.length; index += 1) {
    const domainEntry = value.domains[index]
    if (!isRecord(domainEntry)) {
      throw invalid(
        'invalid-domains',
        'Each catalogue domain entry must be a non-null object.',
      )
    }

    if (!isNonEmptyString(domainEntry.domain)) {
      throw invalid(
        'invalid-domains',
        'Catalogue domain must be a non-empty, trimmed string.',
      )
    }

    if (domains.has(domainEntry.domain)) {
      throw invalid(
        'duplicate-domain',
        `Duplicate domain within service catalogue entry: ${domainEntry.domain}.`,
      )
    }

    const normalized = normalizeDomain(domainEntry.domain)
    if (
      !normalized.valid ||
      normalized.normalized.domain !== domainEntry.domain ||
      normalized.normalized.hostname !== domainEntry.domain
    ) {
      throw invalid(
        'invalid-domains',
        'Catalogue domain must be a canonical registrable domain.',
      )
    }
    domains.add(domainEntry.domain)

    if (
      !Array.isArray(domainEntry.evidence) ||
      domainEntry.evidence.length === 0
    ) {
      throw invalid(
        'invalid-evidence',
        'Each catalogue domain must contain at least one evidence item.',
      )
    }

    for (let evidenceIndex = 0;
      evidenceIndex < domainEntry.evidence.length;
      evidenceIndex += 1) {
      validateEvidence(domainEntry.evidence[evidenceIndex])
    }
  }

  return value as unknown as ServiceCatalogueEntry
}

export function validateServiceCatalogue(
  value: unknown,
): ServiceCatalogue {
  if (!isRecord(value)) {
    throw invalid(
      'invalid-catalogue',
      'Service catalogue must be a non-null object.',
    )
  }

  if (value.schemaVersion !== 1) {
    throw invalid(
      'invalid-schema-version',
      'Service catalogue schemaVersion must be 1.',
    )
  }

  if (
    typeof value.catalogueVersion !== 'number' ||
    !Number.isInteger(value.catalogueVersion) ||
    value.catalogueVersion <= 0
  ) {
    throw invalid(
      'invalid-catalogue-version',
      'Service catalogue catalogueVersion must be a positive integer.',
    )
  }

  if (!isFiniteNonNegativeNumber(value.updatedAt)) {
    throw invalid(
      'invalid-timestamps',
      'Service catalogue updatedAt must be a finite, non-negative number.',
    )
  }

  if (!Array.isArray(value.services)) {
    throw invalid(
      'invalid-catalogue',
      'Service catalogue services must be an array.',
    )
  }

  const serviceIds = new Set<string>()
  for (let index = 0; index < value.services.length; index += 1) {
    const entry = value.services[index]
    const validatedEntry = validateServiceCatalogueEntry(entry)
    if (serviceIds.has(validatedEntry.id)) {
      throw invalid(
        'duplicate-service-id',
        `Duplicate service catalogue ID: ${validatedEntry.id}.`,
      )
    }
    serviceIds.add(validatedEntry.id)
  }

  return value as unknown as ServiceCatalogue
}
