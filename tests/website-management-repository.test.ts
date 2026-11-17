import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WebsiteManagementRepository,
  type WebsiteManagementRepositoryApi,
} from '../src/storage/website-management-repository.ts'
import {
  createDefaultCategories,
  type WebsiteManagementData,
} from '../src/types/website-management.ts'

const STORAGE_KEY = 'websiteManagement'

function createStorageMock() {
  let storedValue: unknown
  let readError: Error | undefined
  let writeError: Error | undefined

  const get = vi.fn(async () => {
    if (readError) {
      throw readError
    }
    return storedValue === undefined ? {} : { [STORAGE_KEY]: storedValue }
  })
  const set = vi.fn(async (items: Record<string, unknown>) => {
    if (writeError) {
      throw writeError
    }
    storedValue = items[STORAGE_KEY]
  })

  return {
    get,
    set,
    setStoredValue(value: unknown) {
      storedValue = value
    },
    setReadError(error: Error | undefined) {
      readError = error
    },
    setWriteError(error: Error | undefined) {
      writeError = error
    },
  }
}

function validData(): WebsiteManagementData {
  const categories = createDefaultCategories(1_700_000_000_000)
  return {
    version: 1,
    websites: [
      {
        id: 'website-1',
        domain: 'example.com',
        hostname: 'www.example.com',
        categoryId: categories[0].id,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    categories,
  }
}

function cloneData(): WebsiteManagementData {
  return structuredClone(validData())
}

describe('WebsiteManagementRepository', () => {
  let storage: ReturnType<typeof createStorageMock>
  let repository: WebsiteManagementRepositoryApi

  beforeEach(() => {
    storage = createStorageMock()
    vi.stubGlobal('chrome', { storage: { local: storage } })
    repository = new WebsiteManagementRepository()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes empty storage with six defaults and no websites', async () => {
    const data = await repository.initialize()

    expect(data.version).toBe(1)
    expect(data.websites).toEqual([])
    expect(data.categories).toHaveLength(6)
    expect(data.categories.every((category) => category.isDefault)).toBe(true)
    expect(storage.set).toHaveBeenCalledOnce()
  })

  it('shares one initialization operation across concurrent calls', async () => {
    const firstCall = repository.initialize()
    const secondCall = repository.initialize()

    expect(firstCall).toBe(secondCall)

    const [first, second] = await Promise.all([firstCall, secondCall])
    expect(second).toEqual(first)
    expect(first.categories).toHaveLength(6)
    expect(storage.set).toHaveBeenCalledOnce()
  })

  it('does not duplicate or reset data on repeated initialization', async () => {
    const first = await repository.initialize()
    const updated: WebsiteManagementData = {
      ...first,
      websites: [
        {
          id: 'website-1',
          domain: 'example.com',
          hostname: 'example.com',
          categoryId: first.categories[0].id,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    await repository.saveData(updated)

    const second = await repository.initialize()

    expect(second).toEqual(updated)
    expect(second).not.toBe(first)
    expect(second.categories).toHaveLength(6)
    expect(storage.set).toHaveBeenCalledTimes(2)
  })

  it('does not recreate defaults after successful initialization', async () => {
    const first = await repository.initialize()
    const updated: WebsiteManagementData = {
      ...first,
      websites: [
        {
          id: 'website-1',
          domain: 'example.com',
          hostname: 'example.com',
          categoryId: first.categories[0].id,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    await repository.saveData(updated)

    await repository.initialize()

    expect(storage.set).toHaveBeenCalledTimes(2)
    expect(storage.set).toHaveBeenLastCalledWith({
      [STORAGE_KEY]: updated,
    })
  })

  it('preserves valid existing data', async () => {
    const data = validData()
    storage.setStoredValue(data)

    await expect(repository.initialize()).resolves.toEqual(data)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('reads and saves valid data', async () => {
    const data = validData()

    await repository.saveData(data)
    await expect(repository.getData()).resolves.toEqual(data)
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: data })
  })

  it.each([
    ['unsupported schema version', (data: WebsiteManagementData) => ({ ...data, version: 2 }), 'unsupported-schema-version'],
    ['missing websites array', (data: WebsiteManagementData) => ({ ...data, websites: undefined }), 'invalid-storage-data'],
    ['missing categories array', (data: WebsiteManagementData) => ({ ...data, categories: undefined }), 'invalid-storage-data'],
    ['invalid website record', (data: WebsiteManagementData) => ({ ...data, websites: [{ ...data.websites[0], domain: '' }] }), 'invalid-storage-data'],
    ['invalid category record', (data: WebsiteManagementData) => ({ ...data, categories: [{ ...data.categories[0], name: '' }] }), 'invalid-storage-data'],
    ['duplicate website ID', (data: WebsiteManagementData) => ({ ...data, websites: [data.websites[0], { ...data.websites[0], domain: 'other.com', hostname: 'other.com' }] }), 'invalid-storage-data'],
    ['duplicate category ID', (data: WebsiteManagementData) => ({ ...data, categories: [data.categories[0], { ...data.categories[1], id: data.categories[0].id }] }), 'invalid-storage-data'],
    ['duplicate category name', (data: WebsiteManagementData) => ({ ...data, categories: [data.categories[0], { ...data.categories[1], name: data.categories[0].name }] }), 'invalid-storage-data'],
    ['invalid domain', (data: WebsiteManagementData) => ({ ...data, websites: [{ ...data.websites[0], domain: 'com', hostname: 'com' }] }), 'invalid-storage-data'],
    ['invalid category reference', (data: WebsiteManagementData) => ({ ...data, websites: [{ ...data.websites[0], categoryId: 'missing-category' }] }), 'invalid-storage-data'],
  ])('rejects %s', async (_name, update, code) => {
    storage.setStoredValue(update(cloneData()))

    await expect(repository.getData()).rejects.toMatchObject({ code })
  })

  it('rejects an uninitialized get', async () => {
    await expect(repository.getData()).rejects.toMatchObject({
      code: 'invalid-storage-data',
    })
  })

  it('reports storage read failures', async () => {
    storage.setReadError(new Error('read failed'))

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'storage-read-failure',
    })
  })

  it('reports storage write failures', async () => {
    storage.setWriteError(new Error('write failed'))

    await expect(repository.saveData(validData())).rejects.toMatchObject({
      code: 'storage-write-failure',
    })
  })

  it('allows initialization to be retried after a failure', async () => {
    storage.setWriteError(new Error('write failed'))

    await expect(repository.initialize()).rejects.toMatchObject({
      code: 'storage-write-failure',
    })

    storage.setWriteError(undefined)
    const data = await repository.initialize()

    expect(data.websites).toEqual([])
    expect(data.categories).toHaveLength(6)
    expect(storage.set).toHaveBeenCalledTimes(2)
  })

  it('reports unavailable Chrome storage', async () => {
    vi.stubGlobal('chrome', undefined)

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'storage-unavailable',
    })
  })
})
