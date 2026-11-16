import { describe, expect, it } from 'vitest'
import {
  domainsAreEquivalent,
  domainsMatch,
  normalizeDomain,
  validateDomainInput,
} from '../src/engines/blocking/index.ts'

function expectDomain(input: string, domain: string, hostname?: string) {
  const result = normalizeDomain(input)

  expect(result).toEqual({
    valid: true,
    normalized: {
      domain,
      hostname: hostname ?? expect.any(String),
    },
  })
}

describe('domain normalization', () => {
  it('normalizes bare, www, URL, path, query, and subdomain inputs', () => {
    for (const input of [
      'youtube.com',
      'www.youtube.com',
      'http://youtube.com',
      'https://www.youtube.com/shorts?feature=share',
      'm.youtube.com',
      'music.youtube.com',
    ]) {
      expectDomain(input, 'youtube.com')
    }
  })

  it('normalizes multi-level public suffixes', () => {
    expectDomain('www.example.co.uk', 'example.co.uk')
  })

  it('normalizes private suffix domains independently', () => {
    expectDomain('foo.github.io', 'foo.github.io')
    expectDomain('foo.blogspot.com', 'foo.blogspot.com')
  })

  it('normalizes internationalized domain names to consistent IDN forms', () => {
    expectDomain(
      'www.münich.com',
      'xn--mnich-kva.com',
      'www.xn--mnich-kva.com',
    )
    expectDomain(
      'www.xn--mnich-kva.com',
      'xn--mnich-kva.com',
      'www.xn--mnich-kva.com',
    )
  })

  it('normalizes case and trailing dots', () => {
    expectDomain('WWW.YouTube.COM.', 'youtube.com', 'www.youtube.com')
  })

  it('does not include URL ports in the normalized hostname', () => {
    expectDomain(
      'https://example.com:8443/path',
      'example.com',
      'example.com',
    )
  })
})

describe('domain validation', () => {
  it.each([
    '',
    '   ',
    'youtube.com/path',
    'youtube..com',
    'https://',
    'https://user:password@youtube.com',
    'https://user%40example.com:pass%21@example.com',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/example',
    'com',
    '192.168.1.1',
    'https://[::1]',
    'localhost',
    'app.localhost',
    'github.io',
    'blogspot.com',
    'youtube.com..',
  ])('rejects invalid input %s', (input) => {
    expect(validateDomainInput(input).valid).toBe(false)
  })

  it('accepts uppercase HTTP protocols', () => {
    expectDomain('HTTPS://example.com', 'example.com', 'example.com')
  })

  it('reports unsupported protocols', () => {
    const result = validateDomainInput('javascript:alert(1)')

    expect(result).toMatchObject({
      valid: false,
      error: { code: 'unsupported-protocol' },
    })
  })

  it.each([
    'https://@example.com',
    'https://:@example.com',
    'https://user@example.com',
    'https://user:password@example.com',
  ])('rejects URL user-info: %s', (input) => {
    expect(validateDomainInput(input)).toMatchObject({
      valid: false,
      error: { code: 'credentials-not-allowed' },
    })
  })

  it('reports public suffix-only input', () => {
    const result = validateDomainInput('co.uk')

    expect(result).toMatchObject({
      valid: false,
      error: { code: 'public-suffix' },
    })
  })

  it('reports private public suffix-only input', () => {
    expect(validateDomainInput('github.io')).toMatchObject({
      valid: false,
      error: { code: 'public-suffix' },
    })
    expect(validateDomainInput('blogspot.com')).toMatchObject({
      valid: false,
      error: { code: 'public-suffix' },
    })
  })
})

describe('domain matching and duplicate detection', () => {
  it('matches a domain with its www and subdomain forms', () => {
    expect(domainsMatch('youtube.com', 'www.youtube.com')).toBe(true)
    expect(domainsMatch('youtube.com', 'm.youtube.com')).toBe(true)
    expect(domainsMatch('youtube.com', 'music.youtube.com')).toBe(true)
  })

  it('rejects partial hostname matches', () => {
    expect(domainsMatch('youtube.com', 'notyoutube.com')).toBe(false)
    expect(domainsMatch('youtube.com', 'fakeyoutube.com')).toBe(false)
  })

  it('detects duplicates through canonical domains', () => {
    expect(
      domainsAreEquivalent(
        'youtube.com',
        'https://www.youtube.com/shorts',
      ),
    ).toBe(true)
  })

  it('matches and deduplicates private suffix domains consistently', () => {
    expect(domainsMatch('foo.github.io', 'www.foo.github.io')).toBe(true)
    expect(domainsMatch('foo.github.io', 'bar.github.io')).toBe(false)
    expect(
      domainsAreEquivalent('foo.github.io', 'https://foo.github.io/path'),
    ).toBe(true)
  })

  it('matches Unicode and Punycode inputs consistently', () => {
    expect(domainsAreEquivalent('münich.com', 'xn--mnich-kva.com')).toBe(true)
  })
})
