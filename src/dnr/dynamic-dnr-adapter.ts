export interface DynamicDnrApi {
  getDynamicRules(
    filter?: chrome.declarativeNetRequest.GetRulesFilter,
  ): Promise<chrome.declarativeNetRequest.Rule[]>

  updateDynamicRules(
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ): Promise<void>
}

export class ChromeDynamicDnrAdapter implements DynamicDnrApi {
  private readonly dnrApi: DynamicDnrApi

  constructor(
    dnrApi: DynamicDnrApi = chrome.declarativeNetRequest,
  ) {
    this.dnrApi = dnrApi
  }

  getDynamicRules(
    filter?: chrome.declarativeNetRequest.GetRulesFilter,
  ): Promise<chrome.declarativeNetRequest.Rule[]> {
    return filter === undefined
      ? this.dnrApi.getDynamicRules()
      : this.dnrApi.getDynamicRules(filter)
  }

  updateDynamicRules(
    options: chrome.declarativeNetRequest.UpdateRuleOptions,
  ): Promise<void> {
    return this.dnrApi.updateDynamicRules(options)
  }
}
