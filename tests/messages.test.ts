import { describe, expect, it } from 'vitest'
import {
  isPingMessage,
  isWebsiteManagementRequest,
  PING_MESSAGE,
} from '../src/types/messages.ts'

describe('message contracts', () => {
  it.each([
    [{ type: 'WEBSITE_MANAGEMENT', operation: 'GET_WEBSITES' }],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'GET_WEBSITE_BY_ID',
        websiteId: 'website-1',
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'ADD_WEBSITE',
        input: { domain: 'example.com' },
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'UPDATE_WEBSITE',
        websiteId: 'website-1',
        updates: { domain: 'example.org', categoryId: null },
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'UPDATE_WEBSITE',
        websiteId: 'website-1',
        updates: { domain: 'example.org' },
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'UPDATE_WEBSITE',
        websiteId: 'website-1',
        updates: { categoryId: 'default-gaming' },
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'UPDATE_WEBSITE',
        websiteId: 'website-1',
        updates: { categoryId: null },
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'REMOVE_WEBSITE',
        websiteId: 'website-1',
      },
    ],
    [
      {
        type: 'WEBSITE_MANAGEMENT',
        operation: 'ASSIGN_CATEGORY',
        websiteId: 'website-1',
        categoryId: 'default-gaming',
      },
    ],
  ])('accepts valid request %j', (message) => {
    expect(isWebsiteManagementRequest(message)).toBe(true)
  })

  it.each([
    { type: 'WEBSITE_MANAGEMENT', operation: 'GET_WEBSITE_BY_ID' },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITE_BY_ID',
      websiteId: '',
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'REMOVE_WEBSITE',
      websiteId: ' ',
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'ADD_WEBSITE',
      input: {},
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'ADD_WEBSITE',
      input: { domain: 'example.com', categoryId: 1 },
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates: { domain: 1 },
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates: {},
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates: { domain: undefined },
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates: { categoryId: undefined },
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates: { domain: undefined, categoryId: undefined },
    },
    {
      type: 'WEBSITE_MANAGEMENT',
      operation: 'ASSIGN_CATEGORY',
      websiteId: 'website-1',
      categoryId: {},
    },
  ])('rejects malformed request %j', (message) => {
    expect(isWebsiteManagementRequest(message)).toBe(false)
  })

  it('rejects unknown message types and operations', () => {
    expect(
      isWebsiteManagementRequest({ type: 'UNKNOWN', operation: 'GET_WEBSITES' }),
    ).toBe(false)
    expect(
      isWebsiteManagementRequest({
        type: 'WEBSITE_MANAGEMENT',
        operation: 'UNKNOWN',
      }),
    ).toBe(false)
  })

  it.each([null, undefined, true, 1, 'message', [], {}])(
    'rejects non-message input %j',
    (message) => {
      expect(isWebsiteManagementRequest(message)).toBe(false)
    },
  )

  it('preserves PING compatibility', () => {
    expect(isPingMessage({ type: PING_MESSAGE })).toBe(true)
    expect(isPingMessage({ type: 'PONG' })).toBe(false)
  })
})
