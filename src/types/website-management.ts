export interface Website {
  id: string
  domain: string
  hostname: string
  categoryId: string | null
  isEnabled: boolean
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface DefaultCategoryDefinition {
  readonly id: string
  readonly name: string
  readonly isDefault: true
}

export const DEFAULT_CATEGORY_DEFINITIONS = [
  {
    id: 'default-social-media',
    name: 'Social Media',
    isDefault: true,
  },
  {
    id: 'default-entertainment',
    name: 'Entertainment',
    isDefault: true,
  },
  {
    id: 'default-gaming',
    name: 'Gaming',
    isDefault: true,
  },
  {
    id: 'default-shopping',
    name: 'Shopping',
    isDefault: true,
  },
  {
    id: 'default-news-reading',
    name: 'News & Reading',
    isDefault: true,
  },
  {
    id: 'default-other',
    name: 'Other',
    isDefault: true,
  },
] as const satisfies readonly DefaultCategoryDefinition[]

export function createDefaultCategories(timestamp = Date.now()): Category[] {
  return DEFAULT_CATEGORY_DEFINITIONS.map((definition) => ({
    ...definition,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

export interface WebsiteManagementData {
  version: 1
  websites: Website[]
  categories: Category[]
}

export const WEBSITE_MANAGEMENT_ERROR_CODES = [
  'invalid-website',
  'duplicate-website',
  'website-not-found',
  'invalid-category',
  'duplicate-category-name',
  'category-not-found',
  'default-category-cannot-be-deleted',
  'default-category-cannot-be-renamed',
  'storage-failure',
  'storage-unavailable',
  'storage-read-failure',
  'storage-write-failure',
  'invalid-storage-data',
  'unsupported-schema-version',
] as const

export type WebsiteManagementErrorCode =
  typeof WEBSITE_MANAGEMENT_ERROR_CODES[number]

export interface WebsiteManagementError {
  code: WebsiteManagementErrorCode
  message: string
}
