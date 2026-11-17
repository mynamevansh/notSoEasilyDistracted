import { describe, expect, it, vi } from 'vitest'
import {
  BlockingRuleEvaluationError,
  domainsMatch,
  evaluateBlockingRules,
  validateBlockingRule,
} from '../src/engines/blocking/index.ts'
import type {
  BlockingEvaluationContext,
  BlockingRule,
  BlockingRuleSource,
  EvaluateBlockingInput,
} from '../src/types/blocking.ts'

const target = {
  domain: 'youtube.com',
  hostname: 'www.youtube.com',
} as const

function createRule(
  overrides: Partial<BlockingRule> = {},
): BlockingRule {
  return {
    id: 'rule-1',
    source: 'manual-website',
    active: true,
    explanation: {
      code: 'manual-block',
      message: 'Manually blocked website',
    },
    matches: () => true,
    ...overrides,
  }
}

function createInput(
  rules: readonly BlockingRule[] = [createRule()],
  overrides: Partial<EvaluateBlockingInput> = {},
): EvaluateBlockingInput {
  return {
    target,
    categoryIds: ['default-social-media'],
    now: 1_000,
    rules,
    ...overrides,
  }
}

describe('blocking rule evaluator', () => {
  it('allows when there are no rules', () => {
    expect(evaluateBlockingRules(createInput([]))).toEqual({
      decision: 'ALLOW',
      reasons: [],
    })
  })

  it('passes matchers only the blocking evaluation context', () => {
    const matches = vi.fn(() => true)

    evaluateBlockingRules(
      createInput([createRule({ matches })]),
    )

    expect(matches).toHaveBeenCalledWith({
      target,
      categoryIds: ['default-social-media'],
      now: 1_000,
    })
    expect(Object.keys(matches.mock.calls[0][0])).toEqual([
      'target',
      'categoryIds',
      'now',
    ])
  })

  it('blocks when one active rule matches', () => {
    expect(evaluateBlockingRules(createInput())).toEqual({
      decision: 'BLOCK',
      reasons: [
        {
          ruleId: 'rule-1',
          source: 'manual-website',
          code: 'manual-block',
          message: 'Manually blocked website',
        },
      ],
    })
  })

  it('allows when rules do not match', () => {
    expect(
      evaluateBlockingRules(
        createInput([createRule({ matches: () => false })]),
      ).decision,
    ).toBe('ALLOW')
  })

  it('collects all matching reasons in input order', () => {
    const rules = [
      createRule({ id: 'rule-b' }),
      createRule({ id: 'rule-a', source: 'category' }),
      createRule({ id: 'rule-c', source: 'scheduled' }),
    ]

    expect(evaluateBlockingRules(createInput(rules)).reasons.map((reason) => reason.ruleId)).toEqual([
      'rule-b',
      'rule-a',
      'rule-c',
    ])
  })

  it.each<BlockingRuleSource>([
    'manual-website',
    'category',
    'focus-session',
    'scheduled',
    'daily-usage-limit',
    'session-restriction',
  ])('supports the %s source', (source) => {
    expect(
      evaluateBlockingRules(
        createInput([createRule({ source })]),
      ).decision,
    ).toBe('BLOCK')
  })

  it('rejects unsupported runtime sources', () => {
    expect(() =>
      validateBlockingRule(createRule({ source: 'unsupported' as BlockingRuleSource })),
    ).toThrow('Rule source is not supported')
  })

  it.each([
    ['', 'Rule id must be a non-empty string'],
    [' ', 'Rule id must be a non-empty string'],
  ])('rejects invalid rule ids', (id, message) => {
    expect(() => validateBlockingRule(createRule({ id }))).toThrow(message)
  })

  it('rejects invalid explanation metadata', () => {
    expect(() =>
      validateBlockingRule(
        createRule({ explanation: { code: '', message: 'message' } }),
      ),
    ).toThrow('Rule explanation code must be a non-empty string')
    expect(() =>
      validateBlockingRule(
        createRule({ explanation: { code: 'code', message: '' } }),
      ),
    ).toThrow('Rule explanation message must be a non-empty string')
  })

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
  ])('rejects invalid startsAt timestamp %s', (startsAt) => {
    expect(() =>
      validateBlockingRule(createRule({ startsAt })),
    ).toThrow('startsAt must be a finite, non-negative number')
  })

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
  ])('rejects invalid expiresAt timestamp %s', (expiresAt) => {
    expect(() =>
      validateBlockingRule(createRule({ expiresAt })),
    ).toThrow('expiresAt must be a finite, non-negative number')
  })

  it('rejects invalid timestamp ordering', () => {
    expect(() =>
      validateBlockingRule(createRule({ startsAt: 100, expiresAt: 100 })),
    ).toThrow('expiresAt must be greater than startsAt')
    expect(() =>
      validateBlockingRule(createRule({ startsAt: 200, expiresAt: 100 })),
    ).toThrow('expiresAt must be greater than startsAt')
  })

  it('treats startsAt as inclusive and expiresAt as exclusive', () => {
    const rule = createRule({ startsAt: 1_000, expiresAt: 2_000 })

    expect(evaluateBlockingRules(createInput([rule], { now: 1_000 })).decision).toBe(
      'BLOCK',
    )
    expect(evaluateBlockingRules(createInput([rule], { now: 1_999 })).decision).toBe(
      'BLOCK',
    )
    expect(evaluateBlockingRules(createInput([rule], { now: 2_000 })).decision).toBe(
      'ALLOW',
    )
  })

  it('ignores inactive, future, and expired rules', () => {
    const rules = [
      createRule({ id: 'inactive', active: false }),
      createRule({ id: 'future', startsAt: 2_000 }),
      createRule({ id: 'expired', expiresAt: 999 }),
    ]

    expect(evaluateBlockingRules(createInput(rules)).decision).toBe('ALLOW')
  })

  it('validates malformed inactive rules before filtering them', () => {
    expect(() =>
      evaluateBlockingRules(
        createInput([
          createRule({ active: false, startsAt: Number.NaN }),
        ]),
      ),
    ).toThrow('startsAt must be a finite, non-negative number')
  })

  it('rejects sparse rule arrays at every missing position', () => {
    const rules = new Array<BlockingRule>(2)
    rules[1] = createRule()

    try {
      evaluateBlockingRules(createInput(rules))
      throw new Error('Expected sparse rules to be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(BlockingRuleEvaluationError)
      expect(error).toMatchObject({ code: 'invalid-rule' })
    }
  })

  it.each([
    {
      domain: 'example.com',
      hostname: 'www.youtube.com',
    },
    {
      domain: 'youtube.com',
      hostname: 'youtube.com.',
    },
    {
      domain: 'youtube.com',
      hostname: 'not a hostname',
    },
  ])('rejects malformed or incoherent normalized targets', (invalidTarget) => {
    expect(() =>
      evaluateBlockingRules(createInput([], { target: invalidTarget })),
    ).toThrow('Evaluation target must be a normalized and coherent domain')
  })

  it('does not silently convert matcher exceptions into ALLOW', () => {
    expect(() =>
      evaluateBlockingRules(
        createInput([
          createRule({
            matches: () => {
              throw new Error('matcher failed')
            },
          }),
        ]),
      ),
    ).toThrow('Matcher for rule "rule-1" threw an error')
  })

  it('rejects non-Boolean matcher results', () => {
    expect(() =>
      evaluateBlockingRules(
        createInput([
          createRule({ matches: (() => 'true') as unknown as BlockingRule['matches'] }),
        ]),
      ),
    ).toThrow('Matcher for rule "rule-1" must return a boolean')
  })

  it('uses the existing domain matcher without normalizing in the evaluator', () => {
    const matches = vi.fn((context: BlockingEvaluationContext) =>
      domainsMatch('youtube.com', context.target.hostname),
    )

    expect(
      evaluateBlockingRules(
        createInput([createRule({ matches })]),
      ).decision,
    ).toBe('BLOCK')
    expect(matches).toHaveBeenCalledOnce()
  })

  it('protects the matcher context from mutation', () => {
    const input = createInput()
    let subsequentContext: BlockingEvaluationContext | undefined
    const mutationAttempts = vi.fn((context: BlockingEvaluationContext) => {
      Reflect.set(context.target, 'domain', 'mutated.example')
      Reflect.set(context.target, 'hostname', 'mutated.example')
      Reflect.set(context.categoryIds, 0, 'mutated-category')
      Reflect.set(context.categoryIds, 'length', 0)
      Reflect.set(context, 'target', { domain: 'mutated.example', hostname: 'mutated.example' })
      Reflect.set(context, 'categoryIds', ['mutated-category'])
      Reflect.set(context, 'now', 0)
      return true
    })
    const verifyContext = vi.fn((context: BlockingEvaluationContext) => {
      subsequentContext = context
      return true
    })

    expect(
      evaluateBlockingRules(
        createInput([
          createRule({ id: 'mutator', matches: mutationAttempts }),
          createRule({ id: 'verifier', matches: verifyContext }),
        ]),
      ).decision,
    ).toBe('BLOCK')

    expect(mutationAttempts).toHaveBeenCalledOnce()
    expect(subsequentContext).toEqual({
      target,
      categoryIds: ['default-social-media'],
      now: 1_000,
    })
    expect(input.target).toBe(target)
    expect(input.categoryIds).toEqual(['default-social-media'])
    expect(input.now).toBe(1_000)
    expect(Object.isFrozen(subsequentContext?.target)).toBe(true)
    expect(Object.isFrozen(subsequentContext?.categoryIds)).toBe(true)
    expect(Object.isFrozen(subsequentContext)).toBe(true)
  })

  it('does not mutate rules, category ids, or context', () => {
    const input = createInput()
    const originalRule = input.rules[0]
    const rules = input.rules
    const categoryIds = input.categoryIds
    const context: BlockingEvaluationContext = {
      target: input.target,
      categoryIds,
      now: input.now,
    }

    evaluateBlockingRules({ ...input, ...context })

    expect(input.target).toBe(target)
    expect(input.now).toBe(1_000)
    expect(input.rules[0]).toBe(originalRule)
    expect(input.rules[0]).toMatchObject({
      id: 'rule-1',
      source: 'manual-website',
      active: true,
      explanation: {
        code: 'manual-block',
        message: 'Manually blocked website',
      },
    })
    expect(rules).toBe(input.rules)
    expect(categoryIds).toBe(input.categoryIds)
    expect(context).toEqual({
      target,
      categoryIds: ['default-social-media'],
      now: 1_000,
    })
  })

  it('is deterministic and does not depend on Date.now', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(999_999)
    const input = createInput()

    expect(evaluateBlockingRules(input)).toEqual(evaluateBlockingRules(input))
    expect(now).not.toHaveBeenCalled()

    now.mockRestore()
  })
})
