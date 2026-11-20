import { describe, expect, it } from 'vitest'
import {
  BlockingTargetValidationError,
  validateBlockingTarget,
  type BlockingTarget,
} from '../src/types/blocking-target.ts'

function createTarget(
  overrides: Partial<BlockingTarget> = {},
): BlockingTarget {
  return {
    id: 'target-1',
    name: 'Example',
    scope: 'registrable-domain',
    domains: ['example.com'],
    isEnabled: true,
    source: 'manual',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('validateBlockingTarget', () => {
  it('accepts a valid hostname target', () => {
    const target = createTarget({
      name: 'Example Blog',
      scope: 'hostname',
      domains: ['blog.example.com'],
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it('rejects a hostname target with two domains', () => {
    expect(() =>
      validateBlockingTarget(
        createTarget({
          scope: 'hostname',
          domains: ['blog.example.com', 'shop.example.com'],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('accepts a valid registrable-domain target', () => {
    const target = createTarget({
      name: 'Example',
      scope: 'registrable-domain',
      domains: ['example.com'],
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it('rejects a registrable-domain target with two domains', () => {
    expect(() =>
      validateBlockingTarget(
        createTarget({
          scope: 'registrable-domain',
          domains: ['example.com', 'example.org'],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('accepts a service target with one domain', () => {
    const target = createTarget({
      id: 'example-service',
      name: 'Example Service',
      scope: 'service',
      domains: ['example.com'],
      source: 'catalogue',
      catalogueId: 'service-example',
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it('accepts a valid service target with multiple domains', () => {
    const target = createTarget({
      id: 'youtube',
      name: 'YouTube',
      scope: 'service',
      domains: [
        'youtube.com',
        'youtu.be',
        'youtube-nocookie.com',
      ],
      source: 'catalogue',
      catalogueId: 'service-youtube',
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it('accepts a valid manual target without catalogueId', () => {
    expect(validateBlockingTarget(createTarget())).toEqual(createTarget())
  })

  it('accepts a valid manual target with a valid catalogueId', () => {
    const target = createTarget({
      catalogueId: 'catalogue-example',
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it('accepts a valid catalogue target with catalogueId', () => {
    const target = createTarget({
      source: 'catalogue',
      catalogueId: 'service-example',
    })

    expect(validateBlockingTarget(target)).toBe(target)
  })

  it.each([
    ['', 'empty id'],
    ['   ', 'whitespace id'],
    [' target-1', 'leading whitespace id'],
    ['target-1 ', 'trailing whitespace id'],
  ])('rejects invalid id %j (%s)', (id) => {
    expect(() =>
      validateBlockingTarget(createTarget({ id })),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-id',
      }),
    )
  })

  it('rejects a missing id', () => {
    const target: Record<string, unknown> = { ...createTarget() }
    delete target.id

    expect(() =>
      validateBlockingTarget(target),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-id',
      }),
    )
  })

  it.each([
    ['', 'empty name'],
    ['   ', 'whitespace name'],
    [' Example', 'leading whitespace name'],
    ['Example ', 'trailing whitespace name'],
  ])('rejects invalid name %j (%s)', (name) => {
    expect(() =>
      validateBlockingTarget(createTarget({ name })),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-name',
      }),
    )
  })

  it('rejects a missing name', () => {
    const target: Record<string, unknown> = { ...createTarget() }
    delete target.name

    expect(() =>
      validateBlockingTarget(target),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-name',
      }),
    )
  })

  it.each(['other', '', null, 1])(
    'rejects invalid scope %j',
    (scope) => {
      expect(() =>
        validateBlockingTarget({
          ...createTarget(),
          scope,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-scope',
        }),
      )
    },
  )

  it.each(['other', '', null, 1])(
    'rejects invalid source %j',
    (source) => {
      expect(() =>
        validateBlockingTarget({
          ...createTarget(),
          source,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-source',
        }),
      )
    },
  )

  it('rejects an empty domains array', () => {
    expect(() =>
      validateBlockingTarget(createTarget({ domains: [] })),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('rejects missing domains', () => {
    const target: Record<string, unknown> = { ...createTarget() }
    delete target.domains

    expect(() =>
      validateBlockingTarget(target),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it.each(['', '   ', ' example.com', 'example.com '])(
    'rejects invalid domain entry %j',
    (domain) => {
      expect(() =>
        validateBlockingTarget(createTarget({ domains: [domain] })),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-domains',
        }),
      )
    },
  )

  it('rejects a sparse domains array', () => {
    const domains = new Array<string>(1)

    expect(() =>
      validateBlockingTarget(createTarget({ domains })),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it('rejects duplicate domains', () => {
    expect(() =>
      validateBlockingTarget(
        createTarget({
          domains: ['example.com', 'example.com'],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-domains',
      }),
    )
  })

  it.each([null, undefined, 1, 'true'])(
    'rejects invalid enabled state %j',
    (isEnabled) => {
      expect(() =>
        validateBlockingTarget({
          ...createTarget(),
          isEnabled,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-enabled-state',
        }),
      )
    },
  )

  it.each([
    [-1, 0],
    [0, -1],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])(
    'rejects invalid timestamps %j',
    (createdAt, updatedAt) => {
      expect(() =>
        validateBlockingTarget(
          createTarget({ createdAt, updatedAt }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-timestamps',
        }),
      )
    },
  )

  it('rejects an updated timestamp earlier than creation', () => {
    expect(() =>
      validateBlockingTarget(
        createTarget({
          createdAt: 2_000,
          updatedAt: 1_000,
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-timestamps',
      }),
    )
  })

  it.each([undefined, '', '   ', 1])(
    'rejects missing or invalid catalogueId %j',
    (catalogueId) => {
      expect(() =>
        validateBlockingTarget({
          ...createTarget({
            source: 'catalogue',
          }),
          catalogueId,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-catalogue-id',
        }),
      )
    },
  )

  it.each(['', '   ', 1])(
    'rejects an invalid provided manual catalogueId %j',
    (catalogueId) => {
      expect(() =>
        validateBlockingTarget({
          ...createTarget(),
          catalogueId,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid-catalogue-id',
        }),
      )
    },
  )

  it('rejects non-object input', () => {
    expect(() =>
      validateBlockingTarget(null),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-target',
      }),
    )
  })

  it('exposes typed validation errors', () => {
    try {
      validateBlockingTarget(createTarget({ domains: [] }))
      throw new Error('Expected validation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(BlockingTargetValidationError)
      expect(error).toMatchObject({ code: 'invalid-domains' })
    }
  })
})
