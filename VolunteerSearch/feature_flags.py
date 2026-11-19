"""Feature flags for VolunteerSearch (FEATURE_FLAGS.md, D-SEARCH-003).

A copy of the list in VolunteerAPI/config/featureFlags.js, which is the source of truth:
same names, same values (a VolunteerAPI test fails if they drift). Set a flag to False
and redeploy to turn that feature off; set it back to True to restore it.
"""
import os

FEATURE_FLAGS = {
    # /map page (LocationPage). Ships off: no maps API key and known problems (D-UI-001).
    "map": False,
    # Application confirmation email (POST /users/send-confirmation-email). Off: applying still works, no email.
    "confirmationEmail": True,
    # Friends: requests, friend list, /friends/* endpoints. Off: the Friends tab, buttons and leaderboard filter are hidden.
    "friends": True,
    # Badges: /badges endpoints and awarding badges. Off: nothing is awarded and badge sections are hidden.
    "badges": True,
}


class FeatureUnavailable(Exception):
    """Raised by require_feature while a flag is off; main.py turns it into a 503."""

    def __init__(self, flag_name: str):
        super().__init__(flag_name)
        self.flag_name = flag_name


def is_enabled(flag_name: str) -> bool:
    """Always ask through this helper. An unknown name is a typo: it raises outside
    production, and in production it logs and counts as enabled, so a typo can never
    switch a feature off."""
    if flag_name not in FEATURE_FLAGS:
        message = f'Unknown feature flag "{flag_name}". Add it to feature_flags.py.'
        if os.getenv("ENV") != "production":
            raise KeyError(message)
        print(f"❌ {message}")
        return True
    return FEATURE_FLAGS[flag_name] is True


def require_feature(flag_name: str):
    """Route dependency: `dependencies=[Depends(require_feature("name"))]` answers 503
    while the flag is off. The name is checked here in every environment, so a typo
    stops the service from starting instead of reaching a live request."""
    if flag_name not in FEATURE_FLAGS:
        raise KeyError(f'Unknown feature flag "{flag_name}". Add it to feature_flags.py.')

    def dependency():
        if not is_enabled(flag_name):
            raise FeatureUnavailable(flag_name)

    return dependency
