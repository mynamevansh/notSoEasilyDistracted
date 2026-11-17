import type { NormalizedDomain } from './domain.ts'

export type BlockingRuleSource =
  | 'manual-website'
  | 'category'
  | 'focus-session'
  | 'scheduled'
  | 'daily-usage-limit'
  | 'session-restriction'

export interface BlockingEvaluationContext {
  readonly target: Readonly<NormalizedDomain>
  readonly categoryIds: readonly string[]
  readonly now: number
}

export interface BlockingRuleExplanation {
  readonly code: string
  readonly message: string
}

export interface BlockingRule {
  readonly id: string
  readonly source: BlockingRuleSource
  readonly active: boolean
  readonly startsAt?: number
  readonly expiresAt?: number
  readonly explanation: BlockingRuleExplanation
  readonly matches: (
    context: Readonly<BlockingEvaluationContext>,
  ) => boolean
}

export interface BlockingReason {
  readonly ruleId: string
  readonly source: BlockingRuleSource
  readonly code: string
  readonly message: string
}

export type BlockingDecision = 'BLOCK' | 'ALLOW'

export interface BlockingEvaluationResult {
  readonly decision: BlockingDecision
  readonly reasons: readonly BlockingReason[]
}

export interface EvaluateBlockingInput {
  readonly target: Readonly<NormalizedDomain>
  readonly categoryIds: readonly string[]
  readonly now: number
  readonly rules: readonly BlockingRule[]
}

export type BlockingRuleValidationErrorCode =
  | 'invalid-rule'
  | 'invalid-context'
  | 'matcher-error'
  | 'matcher-returned-non-boolean'

export interface BlockingRuleValidationError {
  readonly code: BlockingRuleValidationErrorCode
  readonly message: string
}
