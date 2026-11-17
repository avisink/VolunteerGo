// The app starts and renders its shell (D-UI-003).
import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, signInAs } from './helpers'

describe('app shell', () => {
  test('renders the navbar and home page when signed out', async () => {
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Saved' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })

  test('shows the signed-in links and logout when signed in', async () => {
    signInAs()
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Saved' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })
})
