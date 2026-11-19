import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WebsiteManagementResponse,
  WebsiteManagementRequest,
  ExtensionResponse,
} from '../src/types/messages.ts'
import {
  WEBSITE_MANAGEMENT_ERROR_CODES,
  type Website,
} from '../src/types/website-management.ts'

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  service: {
    getWebsites: vi.fn(),
    getWebsiteById: vi.fn(),
    addWebsite: vi.fn(),
    updateWebsite: vi.fn(),
    removeWebsite: vi.fn(),
    assignCategory: vi.fn(),
    setWebsiteEnabled: vi.fn(),
  },
}))

vi.mock('../src/background/background-manager.ts', () => ({
  backgroundManager: {
    initialize: mocks.initialize,
    service: mocks.service,
  },
}))

type MessageListener = (
  message: unknown,
  sender: object,
  sendResponse: (response: ExtensionResponse | WebsiteManagementResponse) => void,
) => boolean | undefined

let dispatchWebsiteManagementRequest:
  | ((request: WebsiteManagementRequest) => Promise<WebsiteManagementResponse>)
  | undefined
let messageListener: MessageListener | undefined

const website: Website = {
  id: 'website-1',
  domain: 'example.com',
  hostname: 'example.com',
  categoryId: 'default-social-media',
  isEnabled: true,
  createdAt: 1,
  updatedAt: 1,
}

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListener = listener
        }),
      },
    },
  })

  const module = await import('../src/background/index.ts')
  dispatchWebsiteManagementRequest =
    module.dispatchWebsiteManagementRequest
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.initialize.mockResolvedValue({})
})

describe('website-management dispatcher', () => {
  it('routes GET_WEBSITES', async () => {
    mocks.service.getWebsites.mockResolvedValue([website])
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITES',
    })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.service.getWebsites).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      ok: true,
      type: 'WEBSITE_MANAGEMENT_RESPONSE',
      operation: 'GET_WEBSITES',
      data: [website],
    })
  })

  it('routes GET_WEBSITE_BY_ID', async () => {
    mocks.service.getWebsiteById.mockResolvedValue(website)
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITE_BY_ID',
      websiteId: 'website-1',
    })

    expect(mocks.service.getWebsiteById).toHaveBeenCalledWith('website-1')
    expect(response).toMatchObject({
      ok: true,
      operation: 'GET_WEBSITE_BY_ID',
      data: website,
    })
  })

  it('routes ADD_WEBSITE', async () => {
    mocks.service.addWebsite.mockResolvedValue(website)
    const input = { domain: 'example.com', categoryId: 'default-social-media' }
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'ADD_WEBSITE',
      input,
    })

    expect(mocks.service.addWebsite).toHaveBeenCalledWith(input)
    expect(response).toMatchObject({
      ok: true,
      operation: 'ADD_WEBSITE',
      data: website,
    })
  })

  it('routes UPDATE_WEBSITE', async () => {
    const updated = { ...website, domain: 'example.org' }
    mocks.service.updateWebsite.mockResolvedValue(updated)
    const updates = { domain: 'example.org', categoryId: null }
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'UPDATE_WEBSITE',
      websiteId: 'website-1',
      updates,
    })

    expect(mocks.service.updateWebsite).toHaveBeenCalledWith(
      'website-1',
      updates,
    )
    expect(response).toMatchObject({
      ok: true,
      operation: 'UPDATE_WEBSITE',
      data: updated,
    })
  })

  it('routes REMOVE_WEBSITE with null data', async () => {
    mocks.service.removeWebsite.mockResolvedValue(undefined)
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'REMOVE_WEBSITE',
      websiteId: 'website-1',
    })

    expect(mocks.service.removeWebsite).toHaveBeenCalledWith('website-1')
    expect(response).toEqual({
      ok: true,
      type: 'WEBSITE_MANAGEMENT_RESPONSE',
      operation: 'REMOVE_WEBSITE',
      data: null,
    })
  })

  it('routes ASSIGN_CATEGORY', async () => {
    mocks.service.assignCategory.mockResolvedValue(website)
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'ASSIGN_CATEGORY',
      websiteId: 'website-1',
      categoryId: 'default-gaming',
    })

    expect(mocks.service.assignCategory).toHaveBeenCalledWith(
      'website-1',
      'default-gaming',
    )
    expect(response).toMatchObject({
      ok: true,
      operation: 'ASSIGN_CATEGORY',
      data: website,
    })
  })

  it('routes SET_WEBSITE_ENABLED', async () => {
    const disabled = { ...website, isEnabled: false }
    mocks.service.setWebsiteEnabled.mockResolvedValue(disabled)
    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'SET_WEBSITE_ENABLED',
      websiteId: 'website-1',
      isEnabled: false,
    })

    expect(mocks.service.setWebsiteEnabled).toHaveBeenCalledWith(
      'website-1',
      false,
    )
    expect(response).toMatchObject({
      ok: true,
      operation: 'SET_WEBSITE_ENABLED',
      data: disabled,
    })
  })

  it('waits for initialization before processing concurrent requests', async () => {
    let resolveInitialization: ((value: object) => void) | undefined
    const pending = new Promise<object>((resolve) => {
      resolveInitialization = resolve
    })
    mocks.initialize.mockReturnValue(pending)
    mocks.service.getWebsites.mockResolvedValue([website])
    mocks.service.getWebsiteById.mockResolvedValue(website)

    const first = dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITES',
    })
    const second = dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITE_BY_ID',
      websiteId: 'website-1',
    })

    expect(mocks.initialize).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    expect(mocks.service.getWebsites).not.toHaveBeenCalled()
    expect(mocks.service.getWebsiteById).not.toHaveBeenCalled()

    resolveInitialization?.({})
    const responses = await Promise.all([first, second])

    expect(mocks.initialize).toHaveBeenCalledTimes(2)
    expect(mocks.service.getWebsites).toHaveBeenCalledTimes(1)
    expect(mocks.service.getWebsiteById).toHaveBeenCalledWith('website-1')
    expect(responses).toEqual([
      {
        ok: true,
        type: 'WEBSITE_MANAGEMENT_RESPONSE',
        operation: 'GET_WEBSITES',
        data: [website],
      },
      {
        ok: true,
        type: 'WEBSITE_MANAGEMENT_RESPONSE',
        operation: 'GET_WEBSITE_BY_ID',
        data: website,
      },
    ])
  })

  it('waits for initialization before calling the service', async () => {
    let resolveInitialization: ((value: object) => void) | undefined
    const pending = new Promise<object>((resolve) => {
      resolveInitialization = resolve
    })
    mocks.initialize.mockReturnValue(pending)
    mocks.service.getWebsites.mockResolvedValue([website])

    const response = dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITES',
    })
    await Promise.resolve()
    expect(mocks.service.getWebsites).not.toHaveBeenCalled()

    resolveInitialization?.({})
    await response
    expect(mocks.service.getWebsites).toHaveBeenCalledTimes(1)
  })

  it('returns structured service errors', async () => {
    mocks.service.getWebsiteById.mockRejectedValue({
      code: 'website-not-found',
      message: 'Website website-1 was not found.',
    })

    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITE_BY_ID',
      websiteId: 'website-1',
    })

    expect(response).toEqual({
      ok: false,
      type: 'WEBSITE_MANAGEMENT_ERROR',
      error: {
        code: 'website-not-found',
        message: 'Website website-1 was not found.',
      },
    })
  })

  it('recognizes every exported service error code', async () => {
    for (const code of WEBSITE_MANAGEMENT_ERROR_CODES) {
      mocks.service.getWebsiteById.mockRejectedValue({
        code,
        message: `Service message for ${code}`,
      })

      const response = await dispatchWebsiteManagementRequest?.({
        type: 'WEBSITE_MANAGEMENT',
        operation: 'GET_WEBSITE_BY_ID',
        websiteId: 'website-1',
      })

      expect(response).toEqual({
        ok: false,
        type: 'WEBSITE_MANAGEMENT_ERROR',
        error: {
          code,
          message: `Service message for ${code}`,
        },
      })
    }
  })

  it('returns internal-error for unknown service error codes', async () => {
    mocks.service.getWebsiteById.mockRejectedValue({
      code: 'unknown-service-code',
      message: 'Internal details',
    })

    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITE_BY_ID',
      websiteId: 'website-1',
    })

    expect(response).toEqual({
      ok: false,
      type: 'WEBSITE_MANAGEMENT_ERROR',
      error: {
        code: 'internal-error',
        message: 'The website-management operation could not be completed.',
      },
    })
  })

  it('returns a safe structured response for unexpected errors', async () => {
    mocks.initialize.mockRejectedValue(new Error('sensitive stack details'))

    const response = await dispatchWebsiteManagementRequest?.({
      type: 'WEBSITE_MANAGEMENT',
      operation: 'GET_WEBSITES',
    })

    expect(response).toEqual({
      ok: false,
      type: 'WEBSITE_MANAGEMENT_ERROR',
      error: {
        code: 'internal-error',
        message: 'The website-management operation could not be completed.',
      },
    })
  })
})

describe('background message listener', () => {
  it('returns PONG without initializing', () => {
    let response: ExtensionResponse | WebsiteManagementResponse | undefined
    const keepChannelOpen = messageListener?.(
      { type: 'PING' },
      {},
      (value) => {
        response = value
      },
    )

    expect(keepChannelOpen).toBe(false)
    expect(response).toEqual({ ok: true, type: 'PONG' })
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it('returns invalid-message for malformed website-management requests', () => {
    let response: ExtensionResponse | WebsiteManagementResponse | undefined
    const keepChannelOpen = messageListener?.(
      { type: 'WEBSITE_MANAGEMENT', operation: 'ADD_WEBSITE', input: {} },
      {},
      (value) => {
        response = value
      },
    )

    expect(keepChannelOpen).toBe(false)
    expect(response).toEqual({
      ok: false,
      type: 'WEBSITE_MANAGEMENT_ERROR',
      error: {
        code: 'invalid-message',
        message: 'The website-management request is invalid.',
      },
    })
  })

  it('preserves the generic ERROR for unsupported message types', () => {
    let response: ExtensionResponse | WebsiteManagementResponse | undefined
    const keepChannelOpen = messageListener?.(
      { type: 'UNKNOWN' },
      {},
      (value) => {
        response = value
      },
    )

    expect(keepChannelOpen).toBe(false)
    expect(response).toEqual({
      ok: false,
      type: 'ERROR',
      error: 'Unsupported message type',
    })
  })

  it('keeps the response channel open and sends one result for valid requests', async () => {
    mocks.service.getWebsites.mockResolvedValue([website])
    let response: ExtensionResponse | WebsiteManagementResponse | undefined
    const keepChannelOpen = messageListener?.(
      { type: 'WEBSITE_MANAGEMENT', operation: 'GET_WEBSITES' },
      {},
      (value) => {
        response = value
      },
    )

    expect(keepChannelOpen).toBe(true)
    await vi.waitFor(() => {
      expect(response).toBeDefined()
    })
    expect(response).toMatchObject({
      ok: true,
      operation: 'GET_WEBSITES',
    })
  })
})
