export const PING_MESSAGE = 'PING' as const

export interface PingMessage {
  type: typeof PING_MESSAGE
}

export type ExtensionMessage = PingMessage

export interface PongResponse {
  ok: true
  type: 'PONG'
}

export interface ErrorResponse {
  ok: false
  type: 'ERROR'
  error: string
}

export type ExtensionResponse = PongResponse | ErrorResponse

export function isPingMessage(message: unknown): message is PingMessage {
  if (typeof message !== 'object' || message === null) {
    return false
  }

  return 'type' in message && message.type === PING_MESSAGE
}
