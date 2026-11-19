import { describe, expect, it, vi } from 'vitest'
import {
  ChromeDynamicDnrAdapter,
  type DynamicDnrApi,
} from '../src/dnr/dynamic-dnr-adapter.ts'

type DynamicDnrRule = Awaited<
  ReturnType<DynamicDnrApi['getDynamicRules']>
>[number]
type DynamicDnrFilter = NonNullable<
  Parameters<DynamicDnrApi['getDynamicRules']>[0]
>
type DynamicDnrUpdateOptions = Parameters<
  DynamicDnrApi['updateDynamicRules']
>[0]

function createDnrApi(): {
  dnrApi: DynamicDnrApi
  getDynamicRules: ReturnType<
    typeof vi.fn<DynamicDnrApi['getDynamicRules']>
  >
  updateDynamicRules: ReturnType<
    typeof vi.fn<DynamicDnrApi['updateDynamicRules']>
  >
} {
  const getDynamicRules =
    vi.fn<DynamicDnrApi['getDynamicRules']>()
  const updateDynamicRules =
    vi.fn<DynamicDnrApi['updateDynamicRules']>()

  return {
    dnrApi: {
      getDynamicRules,
      updateDynamicRules,
    },
    getDynamicRules,
    updateDynamicRules,
  }
}

describe('ChromeDynamicDnrAdapter', () => {
  it('gets all dynamic rules without a filter', async () => {
    const { dnrApi, getDynamicRules } = createDnrApi()
    const rules: DynamicDnrRule[] = [
      {
        id: 101,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: ['example.com'],
          resourceTypes: ['main_frame'],
        },
      },
    ]
    getDynamicRules.mockResolvedValue(rules)
    const adapter = new ChromeDynamicDnrAdapter(dnrApi)

    await expect(adapter.getDynamicRules()).resolves.toBe(rules)
    expect(getDynamicRules).toHaveBeenCalledWith()
  })

  it('delegates a dynamic-rule filter and passes returned rules through', async () => {
    const { dnrApi, getDynamicRules } = createDnrApi()
    const filter: DynamicDnrFilter = {
      ruleIds: [101, 205],
    }
    const rules: DynamicDnrRule[] = [
      {
        id: 205,
        action: { type: 'block' },
        condition: {
          requestDomains: ['other.example'],
          resourceTypes: ['main_frame'],
        },
      },
    ]
    getDynamicRules.mockResolvedValue(rules)
    const adapter = new ChromeDynamicDnrAdapter(dnrApi)

    await expect(adapter.getDynamicRules(filter)).resolves.toEqual(rules)
    expect(getDynamicRules).toHaveBeenCalledWith(filter)
  })

  it('delegates updateDynamicRules with the exact options', async () => {
    const { dnrApi, updateDynamicRules } = createDnrApi()
    updateDynamicRules.mockResolvedValue(undefined)
    const adapter = new ChromeDynamicDnrAdapter(dnrApi)
    const options: DynamicDnrUpdateOptions = {
      removeRuleIds: [101, 205],
      addRules: [
        {
          id: 309,
          priority: 1,
          action: { type: 'block' },
          condition: {
            requestDomains: ['youtube.com'],
            resourceTypes: ['main_frame'],
          },
        },
      ],
    }

    await expect(adapter.updateDynamicRules(options)).resolves.toBeUndefined()
    expect(updateDynamicRules).toHaveBeenCalledOnce()
    expect(updateDynamicRules).toHaveBeenCalledWith(options)
  })

  it('propagates getDynamicRules failures', async () => {
    const { dnrApi, getDynamicRules } = createDnrApi()
    const failure = new Error('DNR read failed')
    getDynamicRules.mockRejectedValue(failure)
    const adapter = new ChromeDynamicDnrAdapter(dnrApi)

    await expect(adapter.getDynamicRules()).rejects.toBe(failure)
  })

  it('propagates updateDynamicRules failures', async () => {
    const { dnrApi, updateDynamicRules } = createDnrApi()
    const failure = new Error('DNR update failed')
    updateDynamicRules.mockRejectedValue(failure)
    const adapter = new ChromeDynamicDnrAdapter(dnrApi)
    const options: DynamicDnrUpdateOptions = {
      removeRuleIds: [101],
    }

    await expect(adapter.updateDynamicRules(options)).rejects.toBe(failure)
  })
})
