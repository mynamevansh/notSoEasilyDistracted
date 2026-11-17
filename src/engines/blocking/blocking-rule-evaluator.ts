import type {
  BlockingEvaluationResult,
  BlockingRule,
  BlockingRuleSource,
  BlockingEvaluationContext,
  EvaluateBlockingInput,
  BlockingRuleValidationError,
  BlockingRuleValidationErrorCode,
} from '../../types/blocking.ts'
import { normalizeDomain } from './domain-normalizer.ts'

const BLOCKING_RULE_SOURCES: readonly BlockingRuleSource[] = [
  'manual-website',
  'category',
  'focus-session',
  'scheduled',
  'daily-usage-limit',
  'session-restriction',
]

export class BlockingRuleEvaluationError
  extends Error
  implements BlockingRuleValidationError
{
  readonly code: BlockingRuleValidationErrorCode

  constructor(
    code: BlockingRuleValidationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BlockingRuleEvaluationError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
  )
}

function invalidRule(message: string): BlockingRuleEvaluationError {
  return new BlockingRuleEvaluationError('invalid-rule', message)
}

function isBlockingRuleSource(value: unknown): value is BlockingRuleSource {
  return (
    typeof value === 'string' &&
    BLOCKING_RULE_SOURCES.includes(value as BlockingRuleSource)
  )
}

function validateOptionalTimestamp(
  value: unknown,
  fieldName: string,
): void {
  if (value !== undefined && !isFiniteNonNegativeNumber(value)) {
    throw invalidRule(
      `${fieldName} must be a finite, non-negative number when provided`,
    )
  }
}

export function validateBlockingRule(rule: unknown): BlockingRule {
  if (!isRecord(rule)) {
    throw invalidRule('Rule must be a non-null object')
  }

  if (!isNonEmptyString(rule.id)) {
    throw invalidRule('Rule id must be a non-empty string')
  }

  if (!isBlockingRuleSource(rule.source)) {
    throw invalidRule('Rule source is not supported')
  }

  if (typeof rule.active !== 'boolean') {
    throw invalidRule('Rule active must be a boolean')
  }

  validateOptionalTimestamp(rule.startsAt, 'startsAt')
  validateOptionalTimestamp(rule.expiresAt, 'expiresAt')

  if (
    typeof rule.startsAt === 'number' &&
    typeof rule.expiresAt === 'number' &&
    rule.expiresAt <= rule.startsAt
  ) {
    throw invalidRule('expiresAt must be greater than startsAt')
  }

  if (!isRecord(rule.explanation)) {
    throw invalidRule('Rule explanation must be an object')
  }

  if (!isNonEmptyString(rule.explanation.code)) {
    throw invalidRule('Rule explanation code must be a non-empty string')
  }

  if (!isNonEmptyString(rule.explanation.message)) {
    throw invalidRule('Rule explanation message must be a non-empty string')
  }

  if (typeof rule.matches !== 'function') {
    throw invalidRule('Rule matcher must be a function')
  }

  return rule as unknown as BlockingRule
}

function validateEvaluationContext(
  input: unknown,
): asserts input is EvaluateBlockingInput {
  if (!isRecord(input)) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation input must be a non-null object',
    )
  }

  if (!isRecord(input.target)) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation target must be an object',
    )
  }

  if (
    !isNonEmptyString(input.target.domain) ||
    !isNonEmptyString(input.target.hostname)
  ) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation target must contain non-empty domain and hostname',
    )
  }

  const normalizedTarget = normalizeDomain(input.target.hostname)
  if (
    !normalizedTarget.valid ||
    normalizedTarget.normalized.domain !== input.target.domain ||
    normalizedTarget.normalized.hostname !== input.target.hostname
  ) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation target must be a normalized and coherent domain',
    )
  }

  if (!isFiniteNonNegativeNumber(input.now)) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation now must be a finite, non-negative number',
    )
  }

  if (
    !Array.isArray(input.categoryIds) ||
    !input.categoryIds.every(isNonEmptyString)
  ) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation categoryIds must be an array of non-empty strings',
    )
  }

  if (!Array.isArray(input.rules)) {
    throw new BlockingRuleEvaluationError(
      'invalid-context',
      'Evaluation rules must be an array',
    )
  }
}

function isApplicable(rule: BlockingRule, now: number): boolean {
  if (!rule.active) {
    return false
  }

  if (rule.startsAt !== undefined && now < rule.startsAt) {
    return false
  }

  return rule.expiresAt === undefined || now < rule.expiresAt
}

export function evaluateBlockingRules(
  input: EvaluateBlockingInput,
): BlockingEvaluationResult {
  validateEvaluationContext(input)

  const rules: BlockingRule[] = []
  for (let index = 0; index < input.rules.length; index += 1) {
    rules.push(validateBlockingRule(input.rules[index]))
  }
  const reasons = []
  const target = Object.freeze({ ...input.target })
  const categoryIds = Object.freeze([...input.categoryIds])
  const context: Readonly<BlockingEvaluationContext> = Object.freeze({
    target,
    categoryIds,
    now: input.now,
  })

  for (const rule of rules) {
    if (!isApplicable(rule, input.now)) {
      continue
    }

    let result: unknown
    try {
      result = rule.matches(context)
    } catch (error) {
      throw new BlockingRuleEvaluationError(
        'matcher-error',
        `Matcher for rule "${rule.id}" threw an error`,
        { cause: error },
      )
    }

    if (typeof result !== 'boolean') {
      throw new BlockingRuleEvaluationError(
        'matcher-returned-non-boolean',
        `Matcher for rule "${rule.id}" must return a boolean`,
      )
    }

    if (result) {
      reasons.push({
        ruleId: rule.id,
        source: rule.source,
        code: rule.explanation.code,
        message: rule.explanation.message,
      })
    }
  }

  return {
    decision: reasons.length > 0 ? 'BLOCK' : 'ALLOW',
    reasons,
  }
}
