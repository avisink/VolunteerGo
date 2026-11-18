import { NavLink } from 'react-router-dom';
import './FeatureUnavailable.css';

// Shown instead of a page whose feature flag is off (D-UI-004).
function FeatureUnavailable() {
  return (
    <div className="feature-unavailable" role="status">
      <h1>Temporarily unavailable</h1>
      <p>This part of VolunteerGo is switched off for a little while. Everything else still works.</p>
      <NavLink to="/" className="feature-unavailable-home">Back to home</NavLink>
    </div>
  );
}

export default FeatureUnavailable;
