import { isEnabled } from '../../config/featureFlags';
import FeatureUnavailable from '../FeatureUnavailable/FeatureUnavailable';

// Renders its children while `flag` is on. While it's off: a route shows the
// "temporarily unavailable" page, and anything else (a nav link, a button, a tab)
// renders `fallback`, which defaults to nothing (D-UI-004).
function FeatureGate({ flag, page = false, fallback = null, children }) {
  if (isEnabled(flag)) return children;
  return page ? <FeatureUnavailable /> : fallback;
}

export default FeatureGate;
