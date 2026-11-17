// Runs before every test file (vite.config.js → test.setupFiles). See D-UI-003.
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Firebase is never contacted in tests. Each test file sets the signed-in user with
// `signInAs(user)` from tests/helpers.jsx; the default is signed out.
vi.mock('../src/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth, callback) => {
    callback(globalThis.__testFirebaseUser ?? null)
    return () => {}
  },
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}))

beforeEach(() => {
  globalThis.__testFirebaseUser = null
  localStorage.clear()
  window.history.pushState({}, '', '/')
  // No test reaches the network: every fetch answers 200 with an empty list unless a test replaces it.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
