import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WebsiteManagementRepository,
  type WebsiteManagementRepositoryApi,
} from '../src/storage/website-management-repository.ts'
import {
  createDefaultCategories,
  DEFAULT_CATEGORY_DEFINITIONS,
  type WebsiteManagementData,
} from '../src/types/website-management.ts'

const STORAGE_KEY = 'websiteManagement'

function createStorageMock() {
  let storedValue: unknown
  let readError: Error | undefined
  let writeError: Error | undefined
  let releaseGet: (() => void) | undefined
  let getBlocked = false

  const get = vi.fn(async () => {
    if (getBlocked) {
      await new Promise<void>((resolve) => {
        releaseGet = resolve
      })
      getBlocked = false
      releaseGet = undefined
    }
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
    blockNextGet() {
      getBlocked = true
    },
    releaseGet() {
      releaseGet?.()
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
        isEnabled: true,
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
          isEnabled: true,
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
          isEnabled: true,
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

  it('migrates legacy websites to enabled and persists the migration', async () => {
    const data = validData()
    const legacyData = structuredClone(data) as {
      websites: Array<Record<string, unknown>>
    }
    delete legacyData.websites[0].isEnabled
    storage.setStoredValue(legacyData)

    await expect(repository.initialize()).resolves.toEqual(data)
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: data })

    await expect(repository.initialize()).resolves.toEqual(data)
    expect(storage.set).toHaveBeenCalledOnce()
  })

  it('serializes initialize and getData during legacy migration', async () => {
    const data = validData()
    const legacyData = structuredClone(data) as {
      websites: Array<Record<string, unknown>>
    }
    delete legacyData.websites[0].isEnabled
    storage.setStoredValue(legacyData)
    storage.blockNextGet()

    const initializePromise = repository.initialize()
    const getDataPromise = repository.getData()
    await Promise.resolve()

    expect(storage.get).toHaveBeenCalledOnce()
    storage.releaseGet()

    await expect(initializePromise).resolves.toEqual(data)
    await expect(getDataPromise).resolves.toEqual(data)
    expect(storage.set).toHaveBeenCalledOnce()
  })

  it('does not let migration overwrite a newer save', async () => {
    const data = validData()
    const legacyRecord = structuredClone(data) as {
      websites: Array<Record<string, unknown>>
    }
    delete legacyRecord.websites[0].isEnabled
    storage.setStoredValue(legacyRecord)
    storage.blockNextGet()

    const migrationPromise = repository.getData()
    const newerData = validData()
    newerData.websites[0].isEnabled = false
    const savePromise = repository.saveData(newerData)
    await Promise.resolve()

    expect(storage.get).toHaveBeenCalledOnce()
    storage.releaseGet()

    await expect(migrationPromise).resolves.toEqual(data)
    await expect(savePromise).resolves.toBeUndefined()
    await expect(repository.getData()).resolves.toEqual(newerData)
  })

  it('serializes multiple concurrent migration callers', async () => {
    const data = validData()
    const legacyData = structuredClone(data) as {
      websites: Array<Record<string, unknown>>
    }
    delete legacyData.websites[0].isEnabled
    storage.setStoredValue(legacyData)

    const results = await Promise.all([
      repository.getData(),
      repository.getData(),
      repository.getData(),
    ])

    expect(results).toEqual([data, data, data])
    expect(storage.set).toHaveBeenCalledOnce()
    expect(storage.get).toHaveBeenCalledTimes(3)
  })

  it.each([true, false])('preserves an existing isEnabled value: %s', async (isEnabled) => {
    const data = validData()
    data.websites[0].isEnabled = isEnabled
    storage.setStoredValue(data)

    await expect(repository.getData()).resolves.toEqual(data)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('reads and saves valid data', async () => {
    const data = validData()

    await repository.saveData(data)
    await expect(repository.getData()).resolves.toEqual(data)
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: data })
  })

  it('rejects duplicate canonical website domains', async () => {
    const data = cloneData()
    data.websites.push({
      ...data.websites[0],
      id: 'website-2',
      hostname: 'm.example.com',
    })
    storage.setStoredValue(data)

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'invalid-storage-data',
    })
  })

  it('rejects equivalent www and subdomain website domains', async () => {
    const data = cloneData()
    data.websites[0].hostname = 'www.example.com'
    data.websites.push({
      ...data.websites[0],
      id: 'website-2',
      hostname: 'm.example.com',
    })
    storage.setStoredValue(data)

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'invalid-storage-data',
    })
  })

  it.each([
    ['missing default', (data: WebsiteManagementData) => {
      data.categories = data.categories.filter(
        (category) => category.id !== DEFAULT_CATEGORY_DEFINITIONS[0].id,
      )
    }],
    ['modified default ID', (data: WebsiteManagementData) => {
      data.categories[0].id = 'custom-social-media'
    }],
    ['modified default name', (data: WebsiteManagementData) => {
      data.categories[0].name = 'Custom Social'
    }],
    ['incorrect default flag', (data: WebsiteManagementData) => {
      data.categories[0].isDefault = false
    }],
  ])('rejects %s categories in existing storage', async (_name, update) => {
    const data = cloneData()
    update(data)
    storage.setStoredValue(data)

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'invalid-storage-data',
    })
  })

  it('accepts valid custom categories alongside all defaults', async () => {
    const data = cloneData()
    data.categories.push({
      id: 'custom-focus',
      name: 'Focus',
      isDefault: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
    storage.setStoredValue(data)

    await expect(repository.getData()).resolves.toEqual(data)
  })

  it('rejects custom categories marked as default', async () => {
    const data = cloneData()
    data.categories.push({
      id: 'custom-focus',
      name: 'Focus',
      isDefault: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
    storage.setStoredValue(data)

    await expect(repository.getData()).rejects.toMatchObject({
      code: 'invalid-storage-data',
    })
  })

  it.each([
    ['unsupported schema version', (data: WebsiteManagementData) => ({ ...data, version: 2 }), 'unsupported-schema-version'],
    ['missing websites array', (data: WebsiteManagementData) => ({ ...data, websites: undefined }), 'invalid-storage-data'],
    ['missing categories array', (data: WebsiteManagementData) => ({ ...data, categories: undefined }), 'invalid-storage-data'],
    ['invalid website record', (data: WebsiteManagementData) => ({ ...data, websites: [{ ...data.websites[0], domain: '' }] }), 'invalid-storage-data'],
    ['invalid website enabled value', (data: WebsiteManagementData) => ({ ...data, websites: [{ ...data.websites[0], isEnabled: 'yes' }] }), 'invalid-storage-data'],
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

  it('recovers the operation queue after a failed operation', async () => {
    storage.setWriteError(new Error('write failed'))

    await expect(repository.saveData(validData())).rejects.toMatchObject({
      code: 'storage-write-failure',
    })

    storage.setWriteError(undefined)
    await expect(repository.saveData(validData())).resolves.toBeUndefined()
    await expect(repository.getData()).resolves.toEqual(validData())
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
