export type DomainValidationErrorCode =
  | 'empty-input'
  | 'unsupported-protocol'
  | 'invalid-url'
  | 'credentials-not-allowed'
  | 'invalid-hostname'
  | 'public-suffix'
  | 'ip-address-not-allowed'
  | 'localhost-not-allowed'

export interface DomainValidationError {
  code: DomainValidationErrorCode
  message: string
}

export interface NormalizedDomain {
  domain: string
  hostname: string
}

export type DomainValidationResult =
  | {
      valid: true
      normalized: NormalizedDomain
    }
  | {
      valid: false
      error: DomainValidationError
    }
