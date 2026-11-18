// The confirmationEmail flag (FEATURE_FLAGS.md): off, applying still works and no email is requested.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { featureFlags } from '../src/config/featureFlags'
import { AuthProvider } from '../src/hooks/useAuth'
import { ProfileProvider } from '../src/contexts/ProfileContext'
import { LeaderboardProvider } from '../src/contexts/LeaderboardContext'
import ApplyModal from '../src/components/ApplyModal/ApplyModal'
import { signInAs } from './helpers'

const shipped = featureFlags.confirmationEmail
const json = (body) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  signInAs()
  fetch.mockImplementation(async (url) => {
    if (url.includes('/users/by-uid/')) return json({ id: 7, firebaseUid: 'uid-1', points: 0 })
    if (url.includes('/opportunities/add')) return json({ pointsAwarded: 0, badgesEarned: [], leveledUp: false })
    return json([])
  })
})
afterEach(() => {
  featureFlags.confirmationEmail = shipped
})

async function apply() {
  const onClose = vi.fn()
  render(
    <AuthProvider>
      <ProfileProvider>
        <LeaderboardProvider>
          <ApplyModal isOpen onClose={onClose} opportunity={{ id: 3, organization: { name: 'Org' } }}
            setShowApplied={() => {}} setShowAnimation={() => {}} />
        </LeaderboardProvider>
      </ProfileProvider>
    </AuthProvider>
  )
  // Wait for the profile to load, then submit.
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/users/by-uid/'), expect.anything()))
  await waitFor(() => fireEvent.submit(screen.getByRole('button', { name: 'Submit Application' }).closest('form')))
  await waitFor(() => expect(onClose).toHaveBeenCalled()) // the modal closes after a successful apply
  return fetch.mock.calls.map(([url]) => url)
}

describe('confirmationEmail flag', () => {
  test('ships on', () => {
    expect(shipped).toBe(true)
  })

  test('off: applying succeeds without asking for an email', async () => {
    featureFlags.confirmationEmail = false
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const urls = await apply()
    expect(urls.some((u) => u.includes('/users/7/opportunities/add'))).toBe(true)
    expect(urls.some((u) => u.includes('/send-confirmation-email'))).toBe(false)
    expect(alert).not.toHaveBeenCalled()
  })

  test('on: applying also asks for the email', async () => {
    featureFlags.confirmationEmail = true
    const urls = await apply()
    expect(urls.some((u) => u.includes('/send-confirmation-email'))).toBe(true)
  })
})
