// The `map` flag: /map shows the unavailable page while it's off (FEATURE_FLAGS.md).
import { afterEach, describe, expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { featureFlags } from '../src/config/featureFlags'
import { renderApp } from './helpers'

// The real page loads Google Maps; a stand-in is enough to see whether the gate lets it through.
vi.mock('../src/components/LocationPage/LocationPage', () => ({
  default: () => <p>map page</p>,
}))

const shipped = featureFlags.map
afterEach(() => {
  featureFlags.map = shipped
})

describe('map flag', () => {
  test('ships off', () => {
    expect(shipped).toBe(false)
  })

  test('off: /map shows the unavailable page and the rest of the app still renders', async () => {
    featureFlags.map = false
    renderApp('/map')
    expect(await screen.findByRole('heading', { name: 'Temporarily unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('map page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument() // navbar still works
  })

  test('on: /map renders the map page', async () => {
    featureFlags.map = true
    renderApp('/map')
    expect(await screen.findByText('map page')).toBeInTheDocument()
    expect(screen.queryByText('Temporarily unavailable')).not.toBeInTheDocument()
  })
})
