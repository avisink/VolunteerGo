// The badges flag (FEATURE_FLAGS.md): off, badge sections are hidden, /badges isn't called,
// and the pages that host them still render.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.badges
const badge = { id: 9, name: 'Newcomer Badge', imageUrl: 'x.png' }
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', points: 5, badges: [badge], opportunities: [], savedOpportunities: [] }
const other = { id: 2, firebaseUid: 'uid-2', name: 'Other Person', points: 3, badges: [badge], opportunities: [] }
const json = (body) => ({ ok: true, status: 200, json: async () => body })
const badgeCalls = () => axios.get.mock.calls.filter(([url]) => url.endsWith('/badges'))

beforeEach(() => {
  signInAs()
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.endsWith('/users')) return json([me, other])
    return json([])
  })
  axios.get.mockImplementation(async (url) => ({
    data: url.includes('/users/by-uid/uid-2') ? other : url.endsWith('/badges') ? [badge] : [],
  }))
})
afterEach(() => {
  featureFlags.badges = shipped
  vi.clearAllMocks()
})

describe('badges flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.badges = on
    })

    test(`${label}: profile page ${on ? 'shows' : 'hides'} the Badges tab and ${on ? 'loads' : 'never loads'} /badges`, async () => {
      renderApp('/profile')
      expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument()
      expect(!!screen.queryByRole('button', { name: 'Badges' })).toBe(on)
      await waitFor(() => expect(badgeCalls().length > 0).toBe(on))
    })

    test(`${label}: a public profile ${on ? 'shows' : 'hides'} its badges`, async () => {
      renderApp('/public-profile/uid-2')
      expect(await screen.findByText('Other Person')).toBeInTheDocument()
      expect(!!screen.queryByText('Badges Earned')).toBe(on)
    })
  })
})
