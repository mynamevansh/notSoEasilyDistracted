import {
  WEBSITE_MANAGEMENT_ERROR,
  WEBSITE_MANAGEMENT_MESSAGE,
  WEBSITE_MANAGEMENT_RESPONSE,
  type ExtensionResponse,
  type WebsiteManagementErrorResponse,
  type WebsiteManagementRequest,
  type WebsiteManagementResponse,
  type WebsiteManagementResponseErrorCode,
  type WebsiteManagementSuccessResponse,
  isPingMessage,
  isWebsiteManagementRequest,
} from '../types/messages.ts'
import {
  WEBSITE_MANAGEMENT_ERROR_CODES,
  type WebsiteManagementErrorCode,
} from '../types/website-management.ts'
import { backgroundManager } from './background-manager.ts'

const recognizedServiceErrorCodes = new Set<string>(
  WEBSITE_MANAGEMENT_ERROR_CODES,
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWebsiteManagementErrorCode(
  value: unknown,
): value is WebsiteManagementErrorCode {
  return (
    typeof value === 'string' &&
    recognizedServiceErrorCodes.has(value)
  )
}

function createWebsiteManagementError(
  code: WebsiteManagementResponseErrorCode,
  message: string,
): WebsiteManagementErrorResponse {
  return {
    ok: false,
    type: WEBSITE_MANAGEMENT_ERROR,
    error: { code, message },
  }
}

function getWebsiteManagementError(
  error: unknown,
): WebsiteManagementErrorResponse {
  if (isRecord(error) && isWebsiteManagementErrorCode(error.code)) {
    if (typeof error.message === 'string' && error.message.length > 0) {
      return createWebsiteManagementError(error.code, error.message)
    }
  }

  return createWebsiteManagementError(
    'internal-error',
    'The website-management operation could not be completed.',
  )
}

export async function dispatchWebsiteManagementRequest(
  request: WebsiteManagementRequest,
): Promise<WebsiteManagementResponse> {
  try {
    await backgroundManager.initialize()

    const service = backgroundManager.service
    let response:
      | WebsiteManagementSuccessResponse
      | undefined

    switch (request.operation) {
      case 'GET_WEBSITES': {
        const data = await service.getWebsites()
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'GET_WEBSITES',
          data,
        }
        break
      }
      case 'GET_WEBSITE_BY_ID': {
        const data = await service.getWebsiteById(request.websiteId)
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'GET_WEBSITE_BY_ID',
          data,
        }
        break
      }
      case 'ADD_WEBSITE': {
        const data = await service.addWebsite(request.input)
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'ADD_WEBSITE',
          data,
        }
        break
      }
      case 'UPDATE_WEBSITE': {
        const data = await service.updateWebsite(
          request.websiteId,
          request.updates,
        )
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'UPDATE_WEBSITE',
          data,
        }
        break
      }
      case 'REMOVE_WEBSITE': {
        await service.removeWebsite(request.websiteId)
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'REMOVE_WEBSITE',
          data: null,
        }
        break
      }
      case 'ASSIGN_CATEGORY': {
        const data = await service.assignCategory(
          request.websiteId,
          request.categoryId,
        )
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'ASSIGN_CATEGORY',
          data,
        }
        break
      }
      case 'SET_WEBSITE_ENABLED': {
        const data = await service.setWebsiteEnabled(
          request.websiteId,
          request.isEnabled,
        )
        response = {
          ok: true,
          type: WEBSITE_MANAGEMENT_RESPONSE,
          operation: 'SET_WEBSITE_ENABLED',
          data,
        }
        break
      }
    }

    if (!response) {
      return getWebsiteManagementError(
        new Error('Unsupported website-management operation'),
      )
    }
    return response
  } catch (error) {
    return getWebsiteManagementError(error)
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse | WebsiteManagementResponse) => void,
  ) => {
    if (isPingMessage(message)) {
      sendResponse({ ok: true, type: 'PONG' })
      return false
    }

    if (isRecord(message) && message.type === WEBSITE_MANAGEMENT_MESSAGE) {
      if (!isWebsiteManagementRequest(message)) {
        sendResponse(
          createWebsiteManagementError(
            'invalid-message',
            'The website-management request is invalid.',
          ),
        )
        return false
      }

      void dispatchWebsiteManagementRequest(message).then(sendResponse)
      return true
    }

    sendResponse({
      ok: false,
      type: 'ERROR',
      error: 'Unsupported message type',
    })
    return false
  },
)
