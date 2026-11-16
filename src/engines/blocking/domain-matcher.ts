import { normalizeDomain } from './domain-normalizer.ts'

export function domainsMatch(left: unknown, right: unknown): boolean {
  const leftResult = normalizeDomain(left)
  const rightResult = normalizeDomain(right)

  return (
    leftResult.valid &&
    rightResult.valid &&
    leftResult.normalized.domain === rightResult.normalized.domain
  )
}

export function domainsAreEquivalent(left: unknown, right: unknown): boolean {
  return domainsMatch(left, right)
}
