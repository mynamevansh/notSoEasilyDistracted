import {
  type ExtensionResponse,
  isPingMessage,
} from '../types/messages.ts'

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    try {
      if (isPingMessage(message)) {
        sendResponse({ ok: true, type: 'PONG' })
        return false
      }

      sendResponse({
        ok: false,
        type: 'ERROR',
        error: 'Unsupported message type',
      })
    } catch (error) {
      sendResponse({
        ok: false,
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return false
  },
)
