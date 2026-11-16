import { parse } from 'tldts'
import type {
  DomainValidationError,
  DomainValidationResult,
} from '../../types/domain.ts'

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i
const HTTP_URL_PATTERN = /^https?:\/\//i
const USER_INFO_PATTERN = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i

function error(
  code: DomainValidationError['code'],
  message: string,
): DomainValidationResult {
  return {
    valid: false,
    error: { code, message },
  }
}

function extractHostname(input: string): DomainValidationResult | string {
  if (SCHEME_PATTERN.test(input)) {
    if (!HTTP_URL_PATTERN.test(input)) {
      return error(
        'unsupported-protocol',
        'Only HTTP and HTTPS URLs are supported.',
      )
    }

    let url: URL
    try {
      url = new URL(input)
    } catch {
      return error('invalid-url', 'The URL is not valid.')
    }

    if (USER_INFO_PATTERN.test(input) || url.username || url.password) {
      return error(
        'credentials-not-allowed',
        'URLs containing usernames or passwords are not allowed.',
      )
    }

    return url.hostname
  }

  if (
    input.startsWith('//') ||
    /[\s/?#:[\]]/.test(input) ||
    input.includes('@')
  ) {
    return error('invalid-hostname', 'Enter a valid domain name.')
  }

  return input
}

export function validateDomainInput(input: unknown): DomainValidationResult {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return error('empty-input', 'Enter a domain name or HTTP(S) URL.')
  }

  const trimmedInput = input.trim()
  const hostnameResult = extractHostname(trimmedInput)

  if (typeof hostnameResult !== 'string') {
    return hostnameResult
  }

  const trailingDots = hostnameResult.match(/\.+$/)?.[0].length ?? 0

  if (trailingDots > 1) {
    return error('invalid-hostname', 'Enter a valid domain name.')
  }

  const hostname = hostnameResult
    .slice(0, hostnameResult.length - trailingDots)
    .toLowerCase()

  if (hostname.length === 0) {
    return error('invalid-hostname', 'Enter a valid domain name.')
  }

  if (hostname.split('.').some((label) => label.length === 0)) {
    return error('invalid-hostname', 'Enter a valid domain name.')
  }

  const parsed = parse(hostname, {
    allowIcannDomains: true,
    allowPrivateDomains: true,
    detectIp: true,
    extractHostname: false,
    validateHostname: true,
  })

  if (parsed.isIp) {
    return error(
      'ip-address-not-allowed',
      'IP addresses are not supported; enter a registrable domain name.',
    )
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return error(
      'localhost-not-allowed',
      'Localhost is not supported; enter a registrable domain name.',
    )
  }

  if (!parsed.hostname || !parsed.domain) {
    return error(
      parsed.publicSuffix === hostname ? 'public-suffix' : 'invalid-hostname',
      parsed.publicSuffix === hostname
        ? 'A public suffix without a registrable domain is not allowed.'
        : 'Enter a valid registrable domain name.',
    )
  }

  const canonicalHostname = new URL(`https://${parsed.hostname}`).hostname
  const canonicalDomain = new URL(`https://${parsed.domain}`).hostname

  return {
    valid: true,
    normalized: {
      domain: canonicalDomain,
      hostname: canonicalHostname,
    },
  }
}
