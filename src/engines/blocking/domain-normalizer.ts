import {
  validateDomainInput,
} from './domain-validator.ts'
import type { DomainValidationResult } from '../../types/domain.ts'

export function normalizeDomain(input: unknown): DomainValidationResult {
  return validateDomainInput(input)
}
