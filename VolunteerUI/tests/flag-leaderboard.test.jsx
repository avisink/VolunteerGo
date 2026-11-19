// The leaderboard flag (FEATURE_FLAGS.md): UI-only. Off, the nav link and profile rank are hidden,
// /leaderboard shows the unavailable page, and the ranking (GET /users) isn't fetched.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.leaderboard
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', location: 'Austin, TX', points: 5, badges: [], opportunities: [], savedOpportunities: [], leaderboardRank: 1 }
const json = (body) => ({ ok: true, status: 200, json: async () => body })
const rankingCalls = () => fetch.mock.calls.filter(([url]) => url.endsWith('/users'))

beforeEach(() => {
  signInAs()
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.endsWith('/users')) return json([me])
    return json([])
  })
  axios.get.mockResolvedValue({ data: [] })
})
afterEach(() => {
  featureFlags.leaderboard = shipped
  vi.clearAllMocks()
})

describe('leaderboard flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.leaderboard = on
    })

    test(`${label}: /leaderboard ${on ? 'renders the ranking' : 'shows the unavailable page'}`, async () => {
      renderApp('/leaderboard')
      expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument()
      await waitFor(() => expect(!!screen.queryByRole('heading', { name: 'Temporarily unavailable' })).toBe(!on))
      expect(!!screen.queryByRole('link', { name: 'Leaderboard' })).toBe(on)
      await waitFor(() => expect(rankingCalls().length > 0).toBe(on))
    })

    test(`${label}: the profile ${on ? 'shows' : 'hides'} the rank`, async () => {
      renderApp('/profile')
      expect(await screen.findByText('Austin, TX')).toBeInTheDocument()
      expect(!!screen.queryByText('Leaderboard Status')).toBe(on)
    })
  })
})
