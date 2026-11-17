export { domainsAreEquivalent, domainsMatch } from './domain-matcher.ts'
export { normalizeDomain } from './domain-normalizer.ts'
export { validateDomainInput } from './domain-validator.ts'
export {
  BlockingRuleEvaluationError,
  evaluateBlockingRules,
  validateBlockingRule,
} from './blocking-rule-evaluator.ts'
export type {
  BlockingDecision,
  BlockingEvaluationContext,
  BlockingEvaluationResult,
  BlockingReason,
  BlockingRule,
  BlockingRuleExplanation,
  BlockingRuleSource,
  BlockingRuleValidationError,
  BlockingRuleValidationErrorCode,
  EvaluateBlockingInput,
} from '../../types/blocking.ts'
