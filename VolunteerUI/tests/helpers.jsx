import { render } from '@testing-library/react'
import App from '../src/components/App/App'
import { AuthProvider } from '../src/hooks/useAuth'

// Call before renderApp() to render as a signed-in Firebase user.
export function signInAs(user = { uid: 'uid-1', email: 'test@example.com' }) {
  globalThis.__testFirebaseUser = { getIdToken: async () => 'test-token', ...user }
}

// Renders the whole app the way main.jsx does, at the given path.
export function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
