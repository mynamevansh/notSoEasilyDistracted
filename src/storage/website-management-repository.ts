import { normalizeDomain } from '../engines/blocking/index.ts'
import {
  DEFAULT_CATEGORY_DEFINITIONS,
  createDefaultCategories,
  type Category,
  type Website,
  type WebsiteManagementData,
  type WebsiteManagementErrorCode,
} from '../types/website-management.ts'

export const WEBSITE_MANAGEMENT_STORAGE_KEY = 'websiteManagement' as const

export class WebsiteManagementRepositoryError extends Error {
  readonly code: WebsiteManagementErrorCode

  constructor(code: WebsiteManagementErrorCode, message: string) {
    super(message)
    this.name = 'WebsiteManagementRepositoryError'
    this.code = code
  }
}

function repositoryError(
  code: WebsiteManagementErrorCode,
  message: string,
): WebsiteManagementRepositoryError {
  return new WebsiteManagementRepositoryError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateWebsite(value: unknown, index: number): Website {
  if (!isRecord(value)) {
    throw repositoryError(
      'invalid-storage-data',
      `Website at index ${index} must be an object.`,
    )
  }

  const { id, domain, hostname, categoryId, createdAt, updatedAt } = value
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(domain) ||
    !isNonEmptyString(hostname) ||
    (categoryId !== null && !isNonEmptyString(categoryId)) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    throw repositoryError(
      'invalid-storage-data',
      `Website at index ${index} has invalid required fields.`,
    )
  }

  const normalizedDomain = normalizeDomain(domain)
  const normalizedHostname = normalizeDomain(hostname)
  if (
    !normalizedDomain.valid ||
    !normalizedHostname.valid ||
    normalizedDomain.normalized.domain !== domain ||
    normalizedHostname.normalized.hostname !== hostname ||
    normalizedDomain.normalized.domain !== normalizedHostname.normalized.domain
  ) {
    throw repositoryError(
      'invalid-storage-data',
      `Website at index ${index} has a non-canonical domain or hostname.`,
    )
  }

  return { id, domain, hostname, categoryId, createdAt, updatedAt }
}

function validateCategory(value: unknown, index: number): Category {
  if (!isRecord(value)) {
    throw repositoryError(
      'invalid-storage-data',
      `Category at index ${index} must be an object.`,
    )
  }

  const { id, name, isDefault, createdAt, updatedAt } = value
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    typeof isDefault !== 'boolean' ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    throw repositoryError(
      'invalid-storage-data',
      `Category at index ${index} has invalid required fields.`,
    )
  }

  return { id, name, isDefault, createdAt, updatedAt }
}

export function validateWebsiteManagementData(
  value: unknown,
): WebsiteManagementData {
  if (!isRecord(value)) {
    throw repositoryError(
      'invalid-storage-data',
      'Website-management storage data must be an object.',
    )
  }

  if (value.version !== 1) {
    throw repositoryError(
      'unsupported-schema-version',
      `Website-management schema version ${String(value.version)} is not supported.`,
    )
  }

  if (!Array.isArray(value.websites) || !Array.isArray(value.categories)) {
    throw repositoryError(
      'invalid-storage-data',
      'Website-management storage data must contain websites and categories arrays.',
    )
  }

  const websites = value.websites.map(validateWebsite)
  const categories = value.categories.map(validateCategory)
  const websiteIds = new Set<string>()
  const websiteDomains = new Set<string>()
  const categoryIds = new Set<string>()
  const categoryNames = new Set<string>()
  const defaultCategoryIds = new Set<string>(
    DEFAULT_CATEGORY_DEFINITIONS.map((definition) => definition.id),
  )

  for (const website of websites) {
    if (websiteIds.has(website.id)) {
      throw repositoryError(
        'invalid-storage-data',
        `Duplicate website ID: ${website.id}.`,
      )
    }
    if (websiteDomains.has(website.domain)) {
      throw repositoryError(
        'invalid-storage-data',
        `Duplicate website domain: ${website.domain}.`,
      )
    }
    websiteIds.add(website.id)
    websiteDomains.add(website.domain)
  }

  for (const category of categories) {
    const normalizedName = category.name.toLocaleLowerCase()
    if (categoryIds.has(category.id)) {
      throw repositoryError(
        'invalid-storage-data',
        `Duplicate category ID: ${category.id}.`,
      )
    }
    if (categoryNames.has(normalizedName)) {
      throw repositoryError(
        'invalid-storage-data',
        `Duplicate category name: ${category.name}.`,
      )
    }
    if (category.isDefault && !defaultCategoryIds.has(category.id)) {
      throw repositoryError(
        'invalid-storage-data',
        `Custom category ${category.id} cannot be marked as default.`,
      )
    }
    categoryIds.add(category.id)
    categoryNames.add(normalizedName)
  }

  for (const definition of DEFAULT_CATEGORY_DEFINITIONS) {
    const category = categories.find(
      (candidate) => candidate.id === definition.id,
    )
    if (
      !category ||
      category.name !== definition.name ||
      category.isDefault !== true
    ) {
      throw repositoryError(
        'invalid-storage-data',
        `Default category ${definition.id} is missing or has been modified.`,
      )
    }
  }

  for (const website of websites) {
    if (website.categoryId !== null && !categoryIds.has(website.categoryId)) {
      throw repositoryError(
        'invalid-storage-data',
        `Website ${website.id} references a missing category.`,
      )
    }
  }

  return {
    version: 1,
    websites,
    categories,
  }
}

export interface WebsiteManagementRepositoryApi {
  initialize(): Promise<WebsiteManagementData>
  getData(): Promise<WebsiteManagementData>
  saveData(data: WebsiteManagementData): Promise<void>
}

export class WebsiteManagementRepository
  implements WebsiteManagementRepositoryApi
{
  private initializationPromise: Promise<WebsiteManagementData> | undefined

  private getStorageArea(): chrome.storage.LocalStorageArea {
    if (
      typeof globalThis.chrome === 'undefined' ||
      !globalThis.chrome.storage ||
      !globalThis.chrome.storage.local
    ) {
      throw repositoryError(
        'storage-unavailable',
        'Chrome local storage is unavailable.',
      )
    }

    return globalThis.chrome.storage.local
  }

  private async readStoredValue(): Promise<unknown> {
    const storage = this.getStorageArea()
    try {
      const result = await storage.get(WEBSITE_MANAGEMENT_STORAGE_KEY)
      return result[WEBSITE_MANAGEMENT_STORAGE_KEY]
    } catch (error) {
      throw repositoryError(
        'storage-read-failure',
        `Failed to read website-management storage: ${getErrorMessage(error)}`,
      )
    }
  }

  // This lock coordinates calls on this instance only, not separate contexts or instances.
  initialize(): Promise<WebsiteManagementData> {
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    const initializationPromise = this.initializeOnce()
    this.initializationPromise = initializationPromise
    void initializationPromise.then(
      () => {
        if (this.initializationPromise === initializationPromise) {
          this.initializationPromise = undefined
        }
      },
      () => {
        if (this.initializationPromise === initializationPromise) {
          this.initializationPromise = undefined
        }
      },
    )
    return initializationPromise
  }

  private async initializeOnce(): Promise<WebsiteManagementData> {
    const storedValue = await this.readStoredValue()
    if (storedValue !== undefined) {
      return validateWebsiteManagementData(storedValue)
    }

    const initialData: WebsiteManagementData = {
      version: 1,
      websites: [],
      categories: createDefaultCategories(),
    }
    await this.saveData(initialData)
    return initialData
  }

  async getData(): Promise<WebsiteManagementData> {
    const storedValue = await this.readStoredValue()
    if (storedValue === undefined) {
      throw repositoryError(
        'invalid-storage-data',
        'Website-management storage has not been initialized.',
      )
    }

    return validateWebsiteManagementData(storedValue)
  }

  async saveData(data: WebsiteManagementData): Promise<void> {
    const validatedData = validateWebsiteManagementData(data)
    const storage = this.getStorageArea()
    try {
      await storage.set({
        [WEBSITE_MANAGEMENT_STORAGE_KEY]: validatedData,
      })
    } catch (error) {
      throw repositoryError(
        'storage-write-failure',
        `Failed to write website-management storage: ${getErrorMessage(error)}`,
      )
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
