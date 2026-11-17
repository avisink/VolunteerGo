// The flag helper, FeatureGate and the "temporarily unavailable" page (D-UI-004).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { featureFlags, isEnabled } from '../src/config/featureFlags'
import FeatureGate from '../src/components/FeatureGate/FeatureGate'

beforeEach(() => {
  featureFlags.testFeature = true // a flag that exists only in this file
})

afterEach(() => {
  delete featureFlags.testFeature
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('isEnabled', () => {
  test('follows the flag, and only the boolean true counts as on', () => {
    expect(isEnabled('testFeature')).toBe(true)
    featureFlags.testFeature = false
    expect(isEnabled('testFeature')).toBe(false)
    featureFlags.testFeature = 'false'
    expect(isEnabled('testFeature')).toBe(false)
  })

  test('throws for an unknown flag in development and tests', () => {
    expect(() => isEnabled('noSuchFeature')).toThrow(/Unknown feature flag "noSuchFeature"/)
    expect(() => isEnabled('toString')).toThrow(/Unknown feature flag/)
  })

  test('in a production build an unknown flag logs an error and counts as on', () => {
    vi.stubEnv('DEV', false)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(isEnabled('noSuchFeature')).toBe(true)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('noSuchFeature'))
  })

  test('every real flag is a boolean', () => {
    delete featureFlags.testFeature
    for (const [name, value] of Object.entries(featureFlags)) {
      expect([name, typeof value]).toEqual([name, 'boolean'])
    }
  })
})

describe('FeatureGate', () => {
  const renderGate = (props) =>
    render(
      <MemoryRouter>
        <FeatureGate flag="testFeature" {...props}>
          <p>the feature</p>
        </FeatureGate>
      </MemoryRouter>
    )

  test('renders its children while the flag is on', () => {
    renderGate({ page: true })
    expect(screen.getByText('the feature')).toBeInTheDocument()
    expect(screen.queryByText('Temporarily unavailable')).not.toBeInTheDocument()
  })

  test('a page shows the unavailable page, with a way home, while the flag is off', () => {
    featureFlags.testFeature = false
    renderGate({ page: true })
    expect(screen.queryByText('the feature')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Temporarily unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  test('anything else renders nothing, or its fallback, while the flag is off', () => {
    featureFlags.testFeature = false
    const { container } = renderGate()
    expect(container).toBeEmptyDOMElement()

    renderGate({ fallback: <p>plain version</p> })
    expect(screen.getByText('plain version')).toBeInTheDocument()
  })
})
