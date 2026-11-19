import type {
  AddWebsiteInput,
  UpdateWebsiteInput,
} from '../services/website-service.ts'
import type {
  Website,
  WebsiteManagementErrorCode,
} from './website-management.ts'

export const PING_MESSAGE = 'PING' as const
export const WEBSITE_MANAGEMENT_MESSAGE = 'WEBSITE_MANAGEMENT' as const
export const WEBSITE_MANAGEMENT_RESPONSE = 'WEBSITE_MANAGEMENT_RESPONSE' as const
export const WEBSITE_MANAGEMENT_ERROR = 'WEBSITE_MANAGEMENT_ERROR' as const
export const SET_WEBSITE_ENABLED = 'SET_WEBSITE_ENABLED' as const

export interface PingMessage {
  type: typeof PING_MESSAGE
}

export interface SetWebsiteEnabledRequest {
  type: typeof WEBSITE_MANAGEMENT_MESSAGE
  operation: typeof SET_WEBSITE_ENABLED
  websiteId: string
  isEnabled: boolean
}

export type WebsiteManagementRequest =
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'GET_WEBSITES'
    }
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'GET_WEBSITE_BY_ID'
      websiteId: string
    }
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'ADD_WEBSITE'
      input: AddWebsiteInput
    }
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'UPDATE_WEBSITE'
      websiteId: string
      updates: UpdateWebsiteInput
    }
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'REMOVE_WEBSITE'
      websiteId: string
    }
  | {
      type: typeof WEBSITE_MANAGEMENT_MESSAGE
      operation: 'ASSIGN_CATEGORY'
      websiteId: string
      categoryId: string | null
    }
  | SetWebsiteEnabledRequest

export type WebsiteManagementOperation = WebsiteManagementRequest['operation']

export interface GetWebsitesResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'GET_WEBSITES'
  data: Website[]
}

export interface GetWebsiteByIdResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'GET_WEBSITE_BY_ID'
  data: Website
}

export interface AddWebsiteResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'ADD_WEBSITE'
  data: Website
}

export interface UpdateWebsiteResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'UPDATE_WEBSITE'
  data: Website
}

export interface RemoveWebsiteResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'REMOVE_WEBSITE'
  data: null
}

export interface AssignCategoryResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: 'ASSIGN_CATEGORY'
  data: Website
}

export interface SetWebsiteEnabledResponse {
  ok: true
  type: typeof WEBSITE_MANAGEMENT_RESPONSE
  operation: typeof SET_WEBSITE_ENABLED
  data: Website
}

export type WebsiteManagementSuccessResponse =
  | GetWebsitesResponse
  | GetWebsiteByIdResponse
  | AddWebsiteResponse
  | UpdateWebsiteResponse
  | RemoveWebsiteResponse
  | AssignCategoryResponse
  | SetWebsiteEnabledResponse

export type WebsiteManagementTransportErrorCode =
  | 'invalid-message'
  | 'unsupported-message'
  | 'internal-error'

export type WebsiteManagementResponseErrorCode =
  | WebsiteManagementErrorCode
  | WebsiteManagementTransportErrorCode

export interface WebsiteManagementErrorResponse {
  ok: false
  type: typeof WEBSITE_MANAGEMENT_ERROR
  error: {
    code: WebsiteManagementResponseErrorCode
    message: string
  }
}

export type WebsiteManagementResponse =
  | WebsiteManagementSuccessResponse
  | WebsiteManagementErrorResponse

export type ExtensionMessage = PingMessage | WebsiteManagementRequest

export interface PongResponse {
  ok: true
  type: 'PONG'
}

export interface ErrorResponse {
  ok: false
  type: 'ERROR'
  error: string
}

export type ExtensionResponse = PongResponse | ErrorResponse

export type ExtensionMessageResponse =
  | ExtensionResponse
  | WebsiteManagementResponse

export function isPingMessage(message: unknown): message is PingMessage {
  if (!isRecord(message)) {
    return false
  }

  return message.type === PING_MESSAGE
}

export function isWebsiteManagementRequest(
  message: unknown,
): message is WebsiteManagementRequest {
  if (!isRecord(message) || message.type !== WEBSITE_MANAGEMENT_MESSAGE) {
    return false
  }

  switch (message.operation) {
    case 'GET_WEBSITES':
      return true
    case 'GET_WEBSITE_BY_ID':
    case 'REMOVE_WEBSITE':
      return isNonEmptyString(message.websiteId)
    case 'ADD_WEBSITE':
      return isAddWebsiteInput(message.input)
    case 'UPDATE_WEBSITE':
      return (
        isNonEmptyString(message.websiteId) &&
        isUpdateWebsiteInput(message.updates)
      )
    case 'ASSIGN_CATEGORY':
      return (
        isNonEmptyString(message.websiteId) &&
        isNullableNonEmptyString(message.categoryId)
      )
    case SET_WEBSITE_ENABLED:
      return (
        isNonEmptyString(message.websiteId) &&
        typeof message.isEnabled === 'boolean'
      )
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value)
}

function isAddWebsiteInput(value: unknown): value is AddWebsiteInput {
  if (!isRecord(value) || !isNonEmptyString(value.domain)) {
    return false
  }

  return (
    !('categoryId' in value) ||
    value.categoryId === undefined ||
    isNullableNonEmptyString(value.categoryId)
  )
}

function isUpdateWebsiteInput(value: unknown): value is UpdateWebsiteInput {
  if (!isRecord(value)) {
    return false
  }

  const hasDomainUpdate = value.domain !== undefined
  const hasCategoryUpdate = value.categoryId !== undefined
  if (!hasDomainUpdate && !hasCategoryUpdate) {
    return false
  }

  return (
    (!('domain' in value) ||
      value.domain === undefined ||
      isNonEmptyString(value.domain)) &&
    (!('categoryId' in value) ||
      value.categoryId === undefined ||
      isNullableNonEmptyString(value.categoryId))
  )
}
