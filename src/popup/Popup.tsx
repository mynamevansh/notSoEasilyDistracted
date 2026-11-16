import { useState } from 'react'
import '../styles/app.css'
import {
  PING_MESSAGE,
  type ExtensionResponse,
} from '../types/messages.ts'

const STORAGE_TEST_KEY = 'notSoEasilyDistractedDiagnostic'

function getExtensionChrome(): typeof chrome {
  if (typeof chrome === 'undefined') {
    throw new Error(
      'Chrome extension APIs are unavailable because chrome is undefined. Open the popup from the loaded extension.',
    )
  }

  if (location.protocol !== 'chrome-extension:') {
    throw new Error(
      `Chrome Storage requires an extension page, but this page uses ${location.protocol}. Load dist through chrome://extensions instead of localhost.`,
    )
  }

  if (typeof chrome.storage === 'undefined') {
    throw new Error(
      'Chrome Storage is unavailable because the storage API is missing. Reload the extension and verify the storage permission in its manifest.',
    )
  }

  if (typeof chrome.storage.local === 'undefined') {
    throw new Error(
      'Chrome Storage is unavailable because chrome.storage.local is missing. Reload the extension from the rebuilt dist directory.',
    )
  }

  return chrome
}

async function verifyBackground(): Promise<void> {
  const extensionChrome = getExtensionChrome()
  const response = await extensionChrome.runtime.sendMessage<
    { type: typeof PING_MESSAGE },
    ExtensionResponse
  >({ type: PING_MESSAGE })

  if (!response.ok) {
    throw new Error(response.error)
  }

  if (response.type !== 'PONG') {
    throw new Error('Unexpected background response')
  }
}

async function verifyStorage(): Promise<void> {
  const extensionChrome = getExtensionChrome()
  const expectedValue = `storage-check-${Date.now()}`

  try {
    await extensionChrome.storage.local.set({
      [STORAGE_TEST_KEY]: expectedValue,
    })
    const storedValues =
      await extensionChrome.storage.local.get(STORAGE_TEST_KEY)

    if (storedValues[STORAGE_TEST_KEY] !== expectedValue) {
      throw new Error('Stored value did not match the test value')
    }
  } finally {
    await extensionChrome.storage.local.remove(STORAGE_TEST_KEY)
  }
}

function Popup() {
  const [status, setStatus] = useState('Not checked')
  const [isChecking, setIsChecking] = useState(false)

  const runDiagnostics = async () => {
    setIsChecking(true)
    setStatus('Checking background and storage...')

    try {
      await verifyBackground()
      await verifyStorage()
      setStatus('Connected: background PONG and storage read/write succeeded.')
    } catch (error) {
      setStatus(
        `Connection check failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <main className="app-shell popup-shell">
      <section className="app-card">
        <div className="app-kicker">Quick controls</div>
        <h1>notSoEasilyDistracted</h1>
        <p>Your focused workspace is ready.</p>
        <button
          className="diagnostic-button"
          type="button"
          onClick={runDiagnostics}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Run connection check'}
        </button>
        <p className="diagnostic-status" role="status">
          {status}
        </p>
      </section>
    </main>
  )
}

export default Popup
