// The gamification flag (FEATURE_FLAGS.md): off, points and level displays are hidden and the
// pages that show them still render.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import axios from 'axios'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp, signInAs } from './helpers'

vi.mock('axios')

const shipped = featureFlags.gamification
const me = { id: 1, firebaseUid: 'uid-1', name: 'Me', location: 'Austin, TX', points: 42, level: 3, badges: [], opportunities: [], savedOpportunities: [] }
const other = { id: 2, firebaseUid: 'uid-2', name: 'Other Person', points: 37, level: 2, badges: [], opportunities: [] }
const json = (body) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  signInAs()
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json(me)
    if (url.endsWith('/users')) return json([me, other])
    return json([])
  })
  axios.get.mockImplementation(async (url) => ({ data: url.includes('/users/by-uid/uid-2') ? other : [] }))
})
afterEach(() => {
  featureFlags.gamification = shipped
  vi.clearAllMocks()
})

describe('gamification flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  describe.each([
    [false, 'off'],
    [true, 'on'],
  ])('%s', (on, label) => {
    beforeEach(() => {
      featureFlags.gamification = on
    })

    test(`${label}: navbar and profile ${on ? 'show' : 'hide'} points and the progress bar`, async () => {
      renderApp('/profile')
      expect(await screen.findByText('Austin, TX')).toBeInTheDocument() // profile data has loaded
      expect(screen.queryAllByText('42 pts').length > 0).toBe(on) // progress bars (navbar + profile)
      expect(!!screen.queryByText('Points')).toBe(on) // profile info row
      expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument() // navbar still works
    })

    test(`${label}: a public profile ${on ? 'shows' : 'hides'} points and level`, async () => {
      renderApp('/public-profile/uid-2')
      expect(await screen.findByText('Other Person')).toBeInTheDocument()
      expect(!!screen.queryByText('Points: 37')).toBe(on)
      expect(!!screen.queryByText('Level: 2')).toBe(on)
    })
  })
})
