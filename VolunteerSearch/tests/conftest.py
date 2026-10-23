import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# main.py reads ENV at import time; production mode skips the embedding model.
os.environ["ENV"] = "production"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


SAMPLE_OPPS = [
    {
        "id": 1,
        "name": "Beach Cleanup",
        "description": "Pick up trash along the shore",
        "tags": ["environment"],
        "skills": ["teamwork"],
        "requirements": [],
        "location": "Miami, FL",
        "organization": {"name": "Ocean Friends"},
    },
    {
        "id": 2,
        "name": "Food Bank Sorting",
        "description": "Sort donations for families",
        "tags": ["hunger"],
        "skills": ["organization"],
        "requirements": ["18+"],
        "location": "Austin, TX",
        "organization": {"name": "City Food Bank"},
    },
    {
        "id": 3,
        "name": "Library Tutoring",
        "description": "Help kids with reading",
        "tags": ["education"],
        "skills": ["teaching"],
        "requirements": [],
        "location": None,
        "organization": {"name": "Public Library"},
    },
]


def _fake_api_response(opps):
    response = MagicMock()
    response.json.return_value = [dict(o) for o in opps]
    response.raise_for_status.return_value = None
    return response


@pytest.fixture
def client():
    """App started with the VolunteerAPI /opportunities call stubbed out."""
    with patch.object(main.requests, "get", return_value=_fake_api_response(SAMPLE_OPPS)) as mock_get:
        with TestClient(main.app) as test_client:
            test_client.mock_get = mock_get
            yield test_client


@pytest.fixture
def client_api_down():
    """App started while VolunteerAPI is unreachable."""
    with patch.object(main.requests, "get", side_effect=main.requests.ConnectionError("down")):
        with TestClient(main.app) as test_client:
            yield test_client
