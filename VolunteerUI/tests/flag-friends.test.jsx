// The friends flag (FEATURE_FLAGS.md): off, every friends entry point is hidden, nothing calls
// /friends, and the pages that host them still render.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.friends
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', points: 5, badges: [], opportunities: [], savedOpportunities: [] }
const other = { id: 2, firebaseUid: 'uid-2', name: 'Other Person', points: 3, badges: [], opportunities: [] }
const json = (body) => ({ ok: true, status: 200, json: async () => body })
const friendsCalls = () => axios.get.mock.calls.concat(axios.post.mock.calls).filter(([url]) => url.includes('/friends/'))

beforeEach(() => {
  signInAs()
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.endsWith('/users')) return json([me, other])
    return json([])
  })
  axios.get.mockImplementation(async (url) => ({ data: url.includes('/users/by-uid/uid-2') ? other : [] }))
  axios.post.mockResolvedValue({ data: {} })
})
afterEach(() => {
  featureFlags.friends = shipped
  vi.clearAllMocks()
})

describe('friends flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.friends = on
    })

    test(`${label}: profile page ${on ? 'shows' : 'hides'} the Friends tab`, async () => {
      renderApp('/profile')
      expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument()
      expect(!!screen.queryByRole('button', { name: 'Friends' })).toBe(on)
    })

    test(`${label}: leaderboard ${on ? 'shows' : 'hides'} the Friends filter and ${on ? 'loads' : 'never loads'} friends`, async () => {
      renderApp('/leaderboard')
      expect(await screen.findByRole('button', { name: 'Community' })).toBeInTheDocument()
      expect(!!screen.queryByRole('button', { name: 'Friends' })).toBe(on)
      await waitFor(() => expect(friendsCalls().length > 0).toBe(on))
    })

    test(`${label}: a public profile ${on ? 'shows' : 'hides'} the add-friend button`, async () => {
      renderApp('/public-profile/uid-2')
      expect(await screen.findByText('Other Person')).toBeInTheDocument()
      await waitFor(() => expect(!!screen.queryByTitle('Add Friend')).toBe(on))
      expect(friendsCalls().length > 0).toBe(on)
    })
  })
})
