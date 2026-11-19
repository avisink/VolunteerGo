// The applications flag (FEATURE_FLAGS.md): off, "I Want to Help" is hidden on the search grid and
// the opportunity page, and both still render.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.applications
const opp = { id: 5, name: 'Beach Cleanup', description: 'Pick up trash', tags: ['environment'], skills: [], requirements: [], location: 'Miami, FL', organization: { name: 'Ocean Friends' } }
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', points: 0, badges: [], opportunities: [], savedOpportunities: [] }
const json = (body) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  signInAs()
  localStorage.setItem('opportunities', JSON.stringify([opp]))
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.includes('/opportunities')) return json([opp])
    return json([])
  })
  axios.get.mockResolvedValue({ data: [] })
})
afterEach(() => {
  featureFlags.applications = shipped
  vi.clearAllMocks()
})

describe('applications flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.applications = on
    })

    test(`${label}: the search grid ${on ? 'shows' : 'hides'} "I Want to Help"`, async () => {
      renderApp('/search')
      expect(await screen.findByText('Beach Cleanup')).toBeInTheDocument()
      expect(!!screen.queryByRole('button', { name: /I Want to Help/ })).toBe(on)
    })

    test(`${label}: the opportunity page ${on ? 'shows' : 'hides'} "I Want to Help"`, async () => {
      renderApp('/opportunity/5')
      expect((await screen.findAllByText('Beach Cleanup')).length).toBeGreaterThan(0)
      expect(!!screen.queryByRole('button', { name: /I Want to Help/ })).toBe(on)
      expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument() // the page still works
    })
  })
})
