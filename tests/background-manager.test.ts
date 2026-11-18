import { describe, expect, it, vi } from 'vitest'
import { BackgroundManager } from '../src/background/background-manager.ts'
import { WebsiteService } from '../src/services/website-service.ts'
import type { WebsiteManagementRepositoryApi } from '../src/storage/website-management-repository.ts'
import {
  createDefaultCategories,
  type WebsiteManagementData,
} from '../src/types/website-management.ts'

function createData(): WebsiteManagementData {
  return {
    version: 1,
    websites: [],
    categories: createDefaultCategories(1_700_000_000_000),
  }
}

function createRepository(
  initialize: WebsiteManagementRepositoryApi['initialize'],
): WebsiteManagementRepositoryApi {
  return {
    initialize: vi.fn(initialize),
    getData: vi.fn(async () => createData()),
    saveData: vi.fn(async () => undefined),
  }
}

describe('BackgroundManager', () => {
  it('creates and reuses repository and service dependencies', () => {
    const repository = createRepository(async () => createData())
    const manager = new BackgroundManager(repository)

    expect(manager.repository).toBe(repository)
    expect(manager.service).toBeInstanceOf(WebsiteService)
  })

  it('shares one initialization promise across concurrent callers', async () => {
    let releaseInitialization: ((data: WebsiteManagementData) => void) | undefined
    const initialization = new Promise<WebsiteManagementData>((resolve) => {
      releaseInitialization = resolve
    })
    const repository = createRepository(() => initialization)
    const manager = new BackgroundManager(repository)

    const first = manager.initialize()
    const second = manager.initialize()

    expect(first).toBe(second)
    expect(repository.initialize).toHaveBeenCalledTimes(1)

    releaseInitialization?.(createData())
    await expect(first).resolves.toEqual(createData())
  })

  it('propagates initialization failures and permits a later retry', async () => {
    const failure = new Error('storage unavailable')
    const initialize = vi
      .fn<WebsiteManagementRepositoryApi['initialize']>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(createData())
    const repository = createRepository(initialize)
    const manager = new BackgroundManager(repository)

    await expect(manager.initialize()).rejects.toBe(failure)
    await expect(manager.initialize()).resolves.toEqual(createData())
    expect(repository.initialize).toHaveBeenCalledTimes(2)
  })
})
