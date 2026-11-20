import { describe, expect, it } from 'vitest'
import {
  ServiceCatalogueValidationError,
  validateServiceCatalogue,
  validateServiceCatalogueEntry,
  type ServiceCatalogue,
  type ServiceCatalogueEvidence,
  type ServiceCatalogueEntry,
} from '../src/types/service-catalogue.ts'

function createEvidence(
  overrides: Partial<ServiceCatalogueEvidence> = {},
): ServiceCatalogueEvidence {
  return {
    source: 'manual-review',
    reference: 'https://example.com/review',
    reviewedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function createEntry(
  overrides: Partial<ServiceCatalogueEntry> = {},
): ServiceCatalogueEntry {
  return {
    id: 'example-service',
    name: 'Example Service',
    domains: [
      {
        domain: 'example.com',
        evidence: [
          {
            source: 'official-documentation',
            reference: 'https://example.com/docs',
            reviewedAt: 1_700_000_000_000,
          },
        ],
      },
    ],
    verificationStatus: 'verified',
    ...overrides,
  }
}

function createCatalogue(
  overrides: Partial<ServiceCatalogue> = {},
): ServiceCatalogue {
  return {
    schemaVersion: 1,
    catalogueVersion: 1,
    updatedAt: 1_700_000_000_000,
    services: [createEntry()],
    ...overrides,
  }
}

describe('validateServiceCatalogueEntry', () => {
  it('accepts a valid single-domain service', () => {
    const entry = createEntry()
    expect(validateServiceCatalogueEntry(entry)).toBe(entry)
  })

  it('accepts a valid multi-domain service', () => {
    const entry = createEntry({
      id: 'video-service',
      name: 'Video Service',
      domains: [
        {
          domain: 'example.com',
          evidence: [
            {
              source: 'official-documentation',
              reference: 'https://example.com/docs',
              reviewedAt: 1,
            },
          ],
        },
        {
          domain: 'example.org',
          evidence: [
            {
              source: 'manual-review',
              reviewedAt: 2,
            },
          ],
        },
      ],
    })

    expect(validateServiceCatalogueEntry(entry)).toBe(entry)
  })

  it.each([null, [], 'entry', 1, true])(
    'rejects malformed entry %j',
    (entry) => {
      expect(() =>
        validateServiceCatalogueEntry(entry),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-entry',
        }),
      )
    },
  )

  it.each(['', '   ', ' service', 'service '])(
    'rejects invalid service id %j',
    (id) => {
      expect(() =>
        validateServiceCatalogueEntry(createEntry({ id })),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-id',
        }),
      )
    },
  )

  it('rejects missing and non-string service ids', () => {
    for (const id of [undefined, null, 1, {}]) {
      const entry: Record<string, unknown> = { ...createEntry(), id }
      expect(() =>
        validateServiceCatalogueEntry(entry),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-id',
        }),
      )
    }
  })

  it.each(['', '   ', ' Service', 'Service '])(
    'rejects invalid service name %j',
    (name) => {
      expect(() =>
        validateServiceCatalogueEntry(createEntry({ name })),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-name',
        }),
      )
    },
  )

  it('rejects missing and non-string service names', () => {
    for (const name of [undefined, null, 1, {}]) {
      const entry: Record<string, unknown> = { ...createEntry(), name }
      expect(() =>
        validateServiceCatalogueEntry(entry),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-name',
        }),
      )
    }
  })

  it.each(['pending-review', 'deprecated', '', null, 1])(
    'rejects invalid verification status %j',
    (verificationStatus) => {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          verificationStatus,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-verification-status',
        }),
      )
    },
  )

  it('rejects an empty domains array', () => {
    expect(() =>
      validateServiceCatalogueEntry(createEntry({ domains: [] })),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('rejects missing domains', () => {
    const entry: Record<string, unknown> = { ...createEntry() }
    delete entry.domains
    expect(() =>
      validateServiceCatalogueEntry(entry),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('rejects sparse domain arrays', () => {
    const domains: unknown[] = new Array<unknown>(1)
    expect(() =>
      validateServiceCatalogueEntry({
        ...createEntry(),
        domains,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('rejects malformed domain entries', () => {
    for (const domainEntry of [null, [], 'example.com', 1]) {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          domains: [domainEntry],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-domains',
        }),
      )
    }
  })

  it.each(['', '   ', ' example.com', 'example.com '])(
    'rejects invalid domain string %j',
    (domain) => {
      expect(() =>
        validateServiceCatalogueEntry(
          createEntry({
            domains: [{
              domain,
              evidence: [{
                source: 'manual-review',
                reviewedAt: 1,
              }],
            }],
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-domains',
        }),
      )
    },
  )

  it('rejects duplicate domains within a service', () => {
    expect(() =>
      validateServiceCatalogueEntry(
        createEntry({
          domains: [
            {
              domain: 'example.com',
              evidence: [createEvidence()],
            },
            {
              domain: 'example.com',
              evidence: [createEvidence()],
            },
          ],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-domain',
      }),
    )
  })

  it('rejects missing evidence', () => {
    expect(() =>
      validateServiceCatalogueEntry(
        createEntry({
          domains: [{ domain: 'example.com', evidence: [] }],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-evidence',
      }),
    )
  })

  it('rejects missing evidence property', () => {
    expect(() =>
      validateServiceCatalogueEntry({
        ...createEntry(),
        domains: [{ domain: 'example.com' }],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-evidence',
      }),
    )
  })

  it('rejects sparse evidence arrays', () => {
    const evidence: unknown[] = new Array<unknown>(1)
    expect(() =>
      validateServiceCatalogueEntry({
        ...createEntry(),
        domains: [{ domain: 'example.com', evidence }],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-evidence',
      }),
    )
  })

  it('rejects malformed evidence objects', () => {
    for (const evidence of [null, [], 'review', 1]) {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          domains: [{ domain: 'example.com', evidence: [evidence] }],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-evidence',
        }),
      )
    }
  })

  it.each(['community-suggestion', 'pending', '', null, 1])(
    'rejects invalid evidence source %j',
    (source) => {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          domains: [{
            domain: 'example.com',
            evidence: [{ source, reviewedAt: 1 }],
          }],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-evidence',
        }),
      )
    },
  )

  it('requires a reference for official documentation evidence', () => {
    expect(() =>
      validateServiceCatalogueEntry({
        ...createEntry(),
        domains: [{
          domain: 'example.com',
          evidence: [{
            source: 'official-documentation',
            reviewedAt: 1,
          }],
        }],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-reference',
      }),
    )
  })

  it('accepts a valid official documentation reference', () => {
    const entry = createEntry({
      domains: [{
        domain: 'example.com',
        evidence: [{
          source: 'official-documentation',
          reference: 'https://example.com/docs',
          reviewedAt: 1,
        }],
      }],
    })
    expect(validateServiceCatalogueEntry(entry)).toBe(entry)
  })

  it('accepts manual-review evidence without a reference', () => {
    const entry = createEntry({
      domains: [{
        domain: 'example.com',
        evidence: [{
          source: 'manual-review',
          reviewedAt: 1,
        }],
      }],
    })
    expect(validateServiceCatalogueEntry(entry)).toBe(entry)
  })

  it.each(['', '   ', ' https://example.com', 1, null])(
    'rejects invalid provided reference %j',
    (reference) => {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          domains: [{
            domain: 'example.com',
            evidence: [{
              source: 'manual-review',
              reference,
              reviewedAt: 1,
            }],
          }],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-reference',
        }),
      )
    },
  )

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '1', null])(
    'rejects invalid evidence reviewedAt %j',
    (reviewedAt) => {
      expect(() =>
        validateServiceCatalogueEntry({
          ...createEntry(),
          domains: [{
            domain: 'example.com',
            evidence: [{
              source: 'manual-review',
              reviewedAt,
            }],
          }],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-timestamps',
        }),
      )
    },
  )

  it.each([
    'https://example.com',
    'http://example.com',
    'example.com/path',
    'example.com:443',
    ' example.com',
    '192.168.1.1',
    'localhost',
    'www.example.com',
  ])(
    'rejects non-canonical domain %j',
    (domain) => {
      expect(() =>
        validateServiceCatalogueEntry(
          createEntry({
            domains: [{
              domain,
              evidence: [createEvidence()],
            }],
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-domains',
        }),
      )
    },
  )

  it('rejects public-suffix-only domains', () => {
    expect(() =>
      validateServiceCatalogueEntry(
        createEntry({
          domains: [{
            domain: 'com',
            evidence: [createEvidence()],
          }],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('exposes typed validation errors', () => {
    try {
      validateServiceCatalogueEntry(createEntry({ domains: [] }))
      throw new Error('Expected validation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceCatalogueValidationError)
      expect(error).toMatchObject({ code: 'invalid-domains' })
    }
  })
})

describe('validateServiceCatalogue', () => {
  it('accepts a valid catalogue', () => {
    const catalogue = createCatalogue()
    expect(validateServiceCatalogue(catalogue)).toBe(catalogue)
  })

  it('accepts a domain shared by two different services', () => {
    const catalogue = createCatalogue({
      services: [
        createEntry({
          id: 'service-a',
          domains: [{
            domain: 'shared.example',
            evidence: [createEvidence()],
          }],
        }),
        createEntry({
          id: 'service-b',
          domains: [{
            domain: 'shared.example',
            evidence: [createEvidence()],
          }],
        }),
      ],
    })

    expect(validateServiceCatalogue(catalogue)).toBe(catalogue)
  })

  it.each([null, [], 'catalogue', 1, true])(
    'rejects malformed catalogue %j',
    (catalogue) => {
      expect(() =>
        validateServiceCatalogue(catalogue),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-catalogue',
        }),
      )
    },
  )

  it.each([undefined, null, 0, 2, '1'])(
    'rejects invalid schemaVersion %j',
    (schemaVersion) => {
      expect(() =>
        validateServiceCatalogue({
          ...createCatalogue(),
          schemaVersion,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-schema-version',
        }),
      )
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null])(
    'rejects invalid catalogueVersion %j',
    (catalogueVersion) => {
      expect(() =>
        validateServiceCatalogue({
          ...createCatalogue(),
          catalogueVersion,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-catalogue-version',
        }),
      )
    },
  )

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '1', null])(
    'rejects invalid catalogue updatedAt %j',
    (updatedAt) => {
      expect(() =>
        validateServiceCatalogue({
          ...createCatalogue(),
          updatedAt,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-timestamps',
        }),
      )
    },
  )

  it('rejects missing services', () => {
    const catalogue: Record<string, unknown> = { ...createCatalogue() }
    delete catalogue.services
    expect(() =>
      validateServiceCatalogue(catalogue),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-catalogue',
      }),
    )
  })

  it('rejects duplicate service IDs', () => {
    expect(() =>
      validateServiceCatalogue(
        createCatalogue({
          services: [
            createEntry({ id: 'same-service' }),
            createEntry({ id: 'same-service' }),
          ],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'duplicate-service-id',
      }),
    )
  })

  it('rejects sparse services arrays', () => {
    const services: unknown[] = new Array<unknown>(1)
    expect(() =>
      validateServiceCatalogue({
        ...createCatalogue(),
        services,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-entry',
      }),
    )
  })
})
