// The savedOpportunities flag (FEATURE_FLAGS.md): off, the Saved link and save buttons are hidden,
// /saved shows the unavailable page, and browsing still works.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.savedOpportunities
const opp = { id: 5, name: 'Beach Cleanup', description: 'Pick up trash', tags: ['environment'], skills: [], location: 'Miami, FL', organization: { name: 'Ocean Friends' } }
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', points: 0, badges: [], opportunities: [], savedOpportunities: [] }
const json = (body) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  signInAs()
  localStorage.setItem('opportunities', JSON.stringify([opp])) // OpportunityContext reads its cache first
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.includes('/opportunities')) return json([opp])
    return json([])
  })
  axios.get.mockResolvedValue({ data: [] })
})
afterEach(() => {
  featureFlags.savedOpportunities = shipped
  vi.clearAllMocks()
})

describe('savedOpportunities flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.savedOpportunities = on
    })

    test(`${label}: the search page ${on ? 'shows' : 'hides'} save buttons and the Saved link`, async () => {
      const { container } = renderApp('/search')
      expect(await screen.findByText('Beach Cleanup')).toBeInTheDocument() // browsing still works
      expect(container.querySelectorAll('.save-btn').length > 0).toBe(on)
      expect(!!screen.queryByRole('link', { name: 'Saved' })).toBe(on)
    })

    test(`${label}: /saved ${on ? 'renders the page' : 'shows the unavailable page'}`, async () => {
      renderApp('/saved')
      expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument()
      expect(!!screen.queryByRole('heading', { name: 'Temporarily unavailable' })).toBe(!on)
    })
  })
})
