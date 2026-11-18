import { normalizeDomain } from '../engines/blocking/index.ts'
import type { WebsiteManagementRepositoryApi } from '../storage/website-management-repository.ts'
import {
  DEFAULT_CATEGORY_DEFINITIONS,
  type Category,
  type Website,
  type WebsiteManagementData,
  type WebsiteManagementErrorCode,
} from '../types/website-management.ts'

export interface AddWebsiteInput {
  domain: string
  categoryId?: string | null
}

export interface UpdateWebsiteInput {
  domain?: string
  categoryId?: string | null
}

export interface WebsiteServiceApi {
  addWebsite(input: AddWebsiteInput): Promise<Website>
  getWebsites(): Promise<Website[]>
  getWebsiteById(id: string): Promise<Website>
  updateWebsite(id: string, updates: UpdateWebsiteInput): Promise<Website>
  setWebsiteEnabled(id: string, isEnabled: boolean): Promise<Website>
  removeWebsite(id: string): Promise<void>
  assignCategory(websiteId: string, categoryId: string | null): Promise<Website>
}

export interface WebsiteServiceOptions {
  generateId?: () => string
  now?: () => number
}

export class WebsiteServiceError extends Error {
  readonly code: WebsiteManagementErrorCode

  constructor(code: WebsiteManagementErrorCode, message: string) {
    super(message)
    this.name = 'WebsiteServiceError'
    this.code = code
  }
}

function serviceError(
  code: WebsiteManagementErrorCode,
  message: string,
): WebsiteServiceError {
  return new WebsiteServiceError(code, message)
}

function cloneWebsite(website: Website): Website {
  return { ...website }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function defaultOtherCategoryId(): string {
  const category = DEFAULT_CATEGORY_DEFINITIONS.find(
    (definition) => definition.name === 'Other',
  )
  return category?.id ?? 'default-other'
}

export class WebsiteService implements WebsiteServiceApi {
  private readonly repository: WebsiteManagementRepositoryApi

  private readonly generateId: () => string

  private readonly now: () => number

  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(
    repository: WebsiteManagementRepositoryApi,
    options: WebsiteServiceOptions = {},
  ) {
    this.repository = repository
    this.generateId = options.generateId ?? (() => crypto.randomUUID())
    this.now = options.now ?? (() => Date.now())
  }

  // This queue coordinates reads and mutations on this instance only, not separate contexts or instances.
  addWebsite(input: AddWebsiteInput): Promise<Website> {
    return this.enqueueMutation(() => this.addWebsiteInternal(input))
  }

  async getWebsites(): Promise<Website[]> {
    await this.waitForMutations()
    const data = await this.loadData()
    return data.websites.map(cloneWebsite)
  }

  async getWebsiteById(id: string): Promise<Website> {
    await this.waitForMutations()
    const data = await this.loadData()
    return cloneWebsite(this.findWebsite(data.websites, id))
  }

  updateWebsite(
    id: string,
    updates: UpdateWebsiteInput,
  ): Promise<Website> {
    return this.enqueueMutation(() => this.updateWebsiteInternal(id, updates))
  }

  setWebsiteEnabled(id: string, isEnabled: boolean): Promise<Website> {
    return this.enqueueMutation(() =>
      this.setWebsiteEnabledInternal(id, isEnabled),
    )
  }

  removeWebsite(id: string): Promise<void> {
    return this.enqueueMutation(() => this.removeWebsiteInternal(id))
  }

  assignCategory(
    websiteId: string,
    categoryId: string | null,
  ): Promise<Website> {
    return this.enqueueMutation(() =>
      this.updateWebsiteInternal(websiteId, { categoryId }),
    )
  }

  private async addWebsiteInternal(input: AddWebsiteInput): Promise<Website> {
    const data = await this.loadData()
    const normalized = this.normalizeWebsiteDomain(input?.domain)
    this.ensureDomainIsUnique(data.websites, normalized.domain)

    const categoryId =
      input.categoryId === undefined
        ? defaultOtherCategoryId()
        : input.categoryId
    this.ensureCategoryExists(data.categories, categoryId)

    const id = this.createUniqueId(data.websites)
    const timestamp = this.now()
    const website: Website = {
      id,
      domain: normalized.domain,
      hostname: normalized.hostname,
      categoryId,
      isEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await this.repository.saveData({
      ...data,
      websites: [...data.websites, website],
    })
    return cloneWebsite(website)
  }

  private async updateWebsiteInternal(
    id: string,
    updates: UpdateWebsiteInput,
  ): Promise<Website> {
    const data = await this.loadData()
    const existing = this.findWebsite(data.websites, id)
    const normalized = updates.domain === undefined
      ? undefined
      : this.normalizeWebsiteDomain(updates.domain)
    const domain = normalized?.domain ?? existing.domain
    const hostname = normalized?.hostname ?? existing.hostname
    this.ensureDomainIsUnique(data.websites, domain, id)

    const categoryId =
      updates.categoryId === undefined ? existing.categoryId : updates.categoryId
    this.ensureCategoryExists(data.categories, categoryId)

    const updatedWebsite: Website = {
      ...existing,
      domain,
      hostname,
      categoryId,
      updatedAt: this.now(),
    }
    const websites = data.websites.map((website) =>
      website.id === id ? updatedWebsite : website,
    )

    await this.repository.saveData({ ...data, websites })
    return cloneWebsite(updatedWebsite)
  }

  private async setWebsiteEnabledInternal(
    id: string,
    isEnabled: boolean,
  ): Promise<Website> {
    if (typeof isEnabled !== 'boolean') {
      throw serviceError(
        'invalid-website',
        'Website enabled state must be a boolean.',
      )
    }

    const data = await this.loadData()
    const existing = this.findWebsite(data.websites, id)
    if (existing.isEnabled === isEnabled) {
      return cloneWebsite(existing)
    }

    const updatedWebsite: Website = {
      ...existing,
      isEnabled,
      updatedAt: this.now(),
    }
    const websites = data.websites.map((website) =>
      website.id === id ? updatedWebsite : website,
    )

    await this.repository.saveData({ ...data, websites })
    return cloneWebsite(updatedWebsite)
  }

  private async removeWebsiteInternal(id: string): Promise<void> {
    const data = await this.loadData()
    this.findWebsite(data.websites, id)
    await this.repository.saveData({
      ...data,
      websites: data.websites.filter((website) => website.id !== id),
    })
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async waitForMutations(): Promise<void> {
    await this.mutationQueue
  }

  private async loadData(): Promise<WebsiteManagementData> {
    return this.repository.initialize()
  }

  private normalizeWebsiteDomain(input: unknown): {
    domain: string
    hostname: string
  } {
    const result = normalizeDomain(input)
    if (!result.valid) {
      throw serviceError(
        'invalid-website',
        result.error.message,
      )
    }
    return result.normalized
  }

  private ensureDomainIsUnique(
    websites: Website[],
    domain: string,
    excludedId?: string,
  ): void {
    if (
      websites.some(
        (website) => website.id !== excludedId && website.domain === domain,
      )
    ) {
      throw serviceError(
        'duplicate-website',
        `A website for ${domain} already exists.`,
      )
    }
  }

  private ensureCategoryExists(
    categories: Category[],
    categoryId: string | null,
  ): void {
    if (categoryId === null) {
      return
    }
    if (!isNonEmptyString(categoryId)) {
      throw serviceError(
        'invalid-category',
        'Category ID must be a non-empty string or null.',
      )
    }
    if (!categories.some((category) => category.id === categoryId)) {
      throw serviceError(
        'category-not-found',
        `Category ${categoryId} was not found.`,
      )
    }
  }

  private findWebsite(websites: Website[], id: string): Website {
    if (!isNonEmptyString(id)) {
      throw serviceError(
        'website-not-found',
        'Website ID must be a non-empty string.',
      )
    }
    const website = websites.find((candidate) => candidate.id === id)
    if (!website) {
      throw serviceError('website-not-found', `Website ${id} was not found.`)
    }
    return website
  }

  private createUniqueId(websites: Website[]): string {
    let id = this.generateId()
    while (websites.some((website) => website.id === id)) {
      id = this.generateId()
    }
    return id
  }
}
