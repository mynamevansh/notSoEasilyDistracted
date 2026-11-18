import { describe, expect, it, vi } from 'vitest'
import {
  WebsiteService,
  type AddWebsiteInput,
} from '../src/services/website-service.ts'
import {
  createDefaultCategories,
  type WebsiteManagementData,
} from '../src/types/website-management.ts'
import type { WebsiteManagementRepositoryApi } from '../src/storage/website-management-repository.ts'

function createRepository(
  initialData?: WebsiteManagementData,
): {
  repository: WebsiteManagementRepositoryApi
  getStoredData: () => WebsiteManagementData
} {
  const defaultData: WebsiteManagementData = {
    version: 1,
    websites: [],
    categories: createDefaultCategories(1_700_000_000_000),
  }

  let storedData = structuredClone(initialData ?? defaultData)

  const repository: WebsiteManagementRepositoryApi = {
    initialize: vi.fn(async () => structuredClone(storedData)),
    getData: vi.fn(async () => structuredClone(storedData)),
    saveData: vi.fn(async (data) => {
      storedData = structuredClone(data)
    }),
  }

  return { repository, getStoredData: () => structuredClone(storedData) }
}

function createService(initialData?: WebsiteManagementData) {
  const setup = createRepository(initialData)
  let id = 0
  let timestamp = 1_800_000_000_000
  return {
    ...setup,
    service: new WebsiteService(setup.repository, {
      generateId: () => `website-${++id}`,
      now: () => ++timestamp,
    }),
  }
}

function createDelayedSaveService() {
  const setup = createRepository()
  let releaseSave: () => void = () => undefined
  let notifySaveStarted: () => void = () => undefined
  const saveStarted = new Promise<void>((resolve) => {
    notifySaveStarted = resolve
  })
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  const repository: WebsiteManagementRepositoryApi = {
    ...setup.repository,
    saveData: vi.fn(async (data) => {
      notifySaveStarted()
      await saveRelease
      await setup.repository.saveData(data)
    }),
  }

  return {
    ...setup,
    saveStarted,
    releaseSave,
    service: new WebsiteService(repository, {
      generateId: () => 'website-1',
      now: () => 1_800_000_000_001,
    }),
  }
}

describe('WebsiteService', () => {
  it.each([
    ['a bare domain', 'youtube.com', 'youtube.com', 'youtube.com'],
    ['an HTTP URL', 'https://www.example.com/path', 'example.com', 'www.example.com'],
    ['a subdomain', 'm.youtube.com', 'youtube.com', 'm.youtube.com'],
  ])('adds %s with canonical domain data', async (_label, input, domain, hostname) => {
    const { service } = createService()

    const website = await service.addWebsite({ domain: input })

    expect(website).toMatchObject({
      domain,
      hostname,
      categoryId: 'default-other',
      isEnabled: true,
    })
  })

  it('assigns an explicit category', async () => {
    const { service } = createService()

    const website = await service.addWebsite({
      domain: 'example.com',
      categoryId: 'default-news-reading',
    })

    expect(website.categoryId).toBe('default-news-reading')
  })

  it('rejects invalid domains and invalid category references', async () => {
    const { service } = createService()

    await expect(service.addWebsite({ domain: 'com' })).rejects.toMatchObject({
      code: 'invalid-website',
    })
    await expect(
      service.addWebsite({ domain: 'example.com', categoryId: 'missing' }),
    ).rejects.toMatchObject({ code: 'category-not-found' })
  })

  it('rejects duplicate canonical, www, and subdomain domains', async () => {
    const { service } = createService()
    await service.addWebsite({ domain: 'youtube.com' })

    await expect(service.addWebsite({ domain: 'www.youtube.com' })).rejects.toMatchObject({
      code: 'duplicate-website',
    })
    await expect(service.addWebsite({ domain: 'm.youtube.com' })).rejects.toMatchObject({
      code: 'duplicate-website',
    })
  })

  it('lists websites and gets a website by ID', async () => {
    const { service } = createService()
    const website = await service.addWebsite({ domain: 'example.com' })

    await expect(service.getWebsites()).resolves.toEqual([website])
    await expect(service.getWebsiteById(website.id)).resolves.toEqual(website)
    await expect(service.getWebsiteById('missing')).rejects.toMatchObject({
      code: 'website-not-found',
    })
  })

  it('updates a website while preserving its ID and creation time', async () => {
    const { service } = createService()
    const original = await service.addWebsite({ domain: 'example.com' })

    const updated = await service.updateWebsite(original.id, {
      domain: 'https://www.example.org/path',
      categoryId: 'default-gaming',
    })

    expect(updated).toMatchObject({
      id: original.id,
      createdAt: original.createdAt,
      domain: 'example.org',
      hostname: 'www.example.org',
      categoryId: 'default-gaming',
    })
    expect(updated.updatedAt).toBeGreaterThan(original.updatedAt)
  })

  it('allows retaining its own domain and rejects invalid or duplicate updates', async () => {
    const { service } = createService()
    const original = await service.addWebsite({ domain: 'example.com' })
    const other = await service.addWebsite({ domain: 'other.com' })

    await expect(
      service.updateWebsite(original.id, { domain: 'www.example.com' }),
    ).resolves.toMatchObject({ id: original.id, domain: 'example.com' })
    await expect(
      service.updateWebsite(original.id, { domain: 'com' }),
    ).rejects.toMatchObject({ code: 'invalid-website' })
    await expect(
      service.updateWebsite(original.id, { domain: other.domain }),
    ).rejects.toMatchObject({ code: 'duplicate-website' })
  })

  it('assigns and clears categories', async () => {
    const { service } = createService()
    const website = await service.addWebsite({ domain: 'example.com' })

    await expect(
      service.assignCategory(website.id, 'default-shopping'),
    ).resolves.toMatchObject({ categoryId: 'default-shopping' })
    await expect(service.assignCategory(website.id, null)).resolves.toMatchObject({
      categoryId: null,
    })
    await expect(
      service.assignCategory(website.id, 'missing'),
    ).rejects.toMatchObject({ code: 'category-not-found' })
  })

  it('disables and re-enables a website while preserving its fields', async () => {
    const { service, getStoredData } = createService()
    const website = await service.addWebsite({
      domain: 'https://www.example.com/path',
      categoryId: 'default-gaming',
    })
    const disabled = await service.setWebsiteEnabled(website.id, false)

    expect(disabled).toEqual({
      ...website,
      isEnabled: false,
      updatedAt: 1_800_000_000_002,
    })
    expect(disabled.id).toBe(website.id)
    expect(disabled.domain).toBe(website.domain)
    expect(disabled.hostname).toBe(website.hostname)
    expect(disabled.categoryId).toBe(website.categoryId)
    expect(disabled.createdAt).toBe(website.createdAt)

    const reenabled = await service.setWebsiteEnabled(website.id, true)
    expect(reenabled).toEqual({
      ...disabled,
      isEnabled: true,
      updatedAt: 1_800_000_000_003,
    })
    expect(getStoredData().websites[0]).toEqual(reenabled)
  })

  it('rejects missing website IDs and invalid enabled values', async () => {
    const { service } = createService()

    await expect(service.setWebsiteEnabled('missing', false)).rejects.toMatchObject({
      code: 'website-not-found',
    })
    await expect(
      service.setWebsiteEnabled('missing', 'false' as unknown as boolean),
    ).rejects.toMatchObject({ code: 'invalid-website' })

    const website = await service.addWebsite({ domain: 'example.com' })
    await expect(
      service.setWebsiteEnabled(website.id, 'false' as unknown as boolean),
    ).rejects.toMatchObject({ code: 'invalid-website' })
  })

  it('does not save or change updatedAt when the enabled state is already current', async () => {
    const initialData: WebsiteManagementData = {
      version: 1,
      websites: [
        {
          id: 'website-1',
          domain: 'example.com',
          hostname: 'www.example.com',
          categoryId: 'default-gaming',
          isEnabled: false,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_001,
        },
      ],
      categories: createDefaultCategories(1_700_000_000_000),
    }
    const { repository } = createRepository(initialData)
    const service = new WebsiteService(repository, {
      now: () => 1_800_000_000_999,
    })

    const first = await service.setWebsiteEnabled('website-1', false)
    const second = await service.setWebsiteEnabled('website-1', false)

    expect(first).toEqual(second)
    expect(second.updatedAt).toBe(1_700_000_000_001)
    expect(repository.saveData).toHaveBeenCalledTimes(0)
  })

  it('serializes concurrent additions without losing either website', async () => {
    const { service, getStoredData } = createService()

    await Promise.all([
      service.addWebsite({ domain: 'first.example.com' }),
      service.addWebsite({ domain: 'second.example.org' }),
    ])

    expect(getStoredData().websites.map((website) => website.domain)).toEqual([
      'example.com',
      'example.org',
    ])
    expect(getStoredData().websites).toHaveLength(2)
    expect(new Set(getStoredData().websites.map((website) => website.id)).size).toBe(2)
  })

  it('serializes concurrent updates without overwriting either change', async () => {
    const { service, getStoredData } = createService()
    const first = await service.addWebsite({ domain: 'first.example.com' })
    const second = await service.addWebsite({ domain: 'second.example.org' })

    await Promise.all([
      service.updateWebsite(first.id, { categoryId: 'default-gaming' }),
      service.updateWebsite(second.id, { categoryId: 'default-shopping' }),
    ])

    const websites = getStoredData().websites
    expect(websites.find((website) => website.id === first.id)?.categoryId).toBe(
      'default-gaming',
    )
    expect(websites.find((website) => website.id === second.id)?.categoryId).toBe(
      'default-shopping',
    )
  })

  it('serializes concurrent removals without losing either removal', async () => {
    const { service, getStoredData } = createService()
    const first = await service.addWebsite({ domain: 'first.example.com' })
    const second = await service.addWebsite({ domain: 'second.example.org' })

    await Promise.all([
      service.removeWebsite(first.id),
      service.removeWebsite(second.id),
    ])

    expect(getStoredData().websites).toEqual([])
  })

  it('continues processing mutations after a failed mutation', async () => {
    const { service, getStoredData } = createService()

    await expect(service.addWebsite({ domain: 'com' })).rejects.toMatchObject({
      code: 'invalid-website',
    })
    const website = await service.addWebsite({ domain: 'valid.example.com' })

    expect(getStoredData().websites).toEqual([expect.objectContaining({ id: website.id })])
  })

  it('assigns a category through the queue without nesting it', async () => {
    const { service } = createService()
    const website = await service.addWebsite({ domain: 'example.com' })

    await expect(
      service.assignCategory(website.id, 'default-gaming'),
    ).resolves.toMatchObject({ categoryId: 'default-gaming' })
  })

  it('waits for a pending mutation before listing websites', async () => {
    const { service, saveStarted, releaseSave } = createDelayedSaveService()
    const addPromise = service.addWebsite({ domain: 'example.com' })
    await saveStarted

    let readCompleted = false
    const readPromise = service.getWebsites().then((websites) => {
      readCompleted = true
      return websites
    })
    await Promise.resolve()
    expect(readCompleted).toBe(false)

    releaseSave()
    await expect(readPromise).resolves.toEqual([
      expect.objectContaining({ domain: 'example.com' }),
    ])
    await addPromise
  })

  it('waits for a pending mutation before looking up a website', async () => {
    const { service, saveStarted, releaseSave } = createDelayedSaveService()
    const addPromise = service.addWebsite({ domain: 'example.com' })
    await saveStarted

    const readPromise = service.getWebsiteById('website-1')
    releaseSave()

    await expect(readPromise).resolves.toMatchObject({
      id: 'website-1',
      domain: 'example.com',
    })
    await addPromise
  })

  it('continues serving reads after a failed mutation', async () => {
    const { service } = createService()

    await expect(service.addWebsite({ domain: 'com' })).rejects.toMatchObject({
      code: 'invalid-website',
    })

    await expect(service.getWebsites()).resolves.toEqual([])
  })

  it('removes websites without changing categories', async () => {
    const { service, getStoredData } = createService()
    const website = await service.addWebsite({ domain: 'example.com' })
    const categoryIds = getStoredData().categories.map((category) => category.id)

    await expect(service.removeWebsite(website.id)).resolves.toBeUndefined()
    expect(getStoredData().websites).toEqual([])
    expect(getStoredData().categories.map((category) => category.id)).toEqual(categoryIds)
    await expect(service.removeWebsite(website.id)).rejects.toMatchObject({
      code: 'website-not-found',
    })
  })

  it('does not mutate inputs or stored website objects', async () => {
    const { service, repository, getStoredData } = createService()
    const input: AddWebsiteInput = { domain: 'WWW.Example.com' }
    const website = await service.addWebsite(input)
    const savedWebsite = getStoredData().websites[0]
    const savedData = getStoredData()

    await service.updateWebsite(website.id, { categoryId: 'default-gaming' })

    expect(input).toEqual({ domain: 'WWW.Example.com' })
    expect(savedWebsite).toEqual(website)
    expect(savedData.websites[0]).toEqual(website)
    expect(repository.saveData).toHaveBeenCalled()
  })

  it('returns cloned websites that cannot mutate repository data', async () => {
    const { service, getStoredData } = createService()
    await service.addWebsite({ domain: 'example.com' })

    const websites = await service.getWebsites()
    websites[0].domain = 'changed.example'
    const website = await service.getWebsiteById(websites[0].id)

    expect(website.domain).toBe('example.com')
    expect(getStoredData().websites[0].domain).toBe('example.com')
  })
})
