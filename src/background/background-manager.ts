import {
  WebsiteManagementRepository,
  type WebsiteManagementRepositoryApi,
} from '../storage/website-management-repository.ts'
import {
  WebsiteService,
  type WebsiteServiceApi,
} from '../services/website-service.ts'
import type { WebsiteManagementData } from '../types/website-management.ts'

export class BackgroundManager {
  readonly repository: WebsiteManagementRepositoryApi
  readonly service: WebsiteServiceApi

  private initializationPromise: Promise<WebsiteManagementData> | undefined

  constructor(repository: WebsiteManagementRepositoryApi = new WebsiteManagementRepository()) {
    this.repository = repository
    this.service = new WebsiteService(repository)
  }

  initialize(): Promise<WebsiteManagementData> {
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    const initializationPromise = this.repository.initialize()
    this.initializationPromise = initializationPromise
    void initializationPromise.then(
      () => undefined,
      () => {
        if (this.initializationPromise === initializationPromise) {
          this.initializationPromise = undefined
        }
      },
    )
    return initializationPromise
  }
}

export const backgroundManager = new BackgroundManager()
