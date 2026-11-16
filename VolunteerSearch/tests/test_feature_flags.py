"""The flag helper and the shared 503 dependency (D-SEARCH-003)."""
import pytest
from fastapi import Depends

import feature_flags
import main
from feature_flags import is_enabled, require_feature


@pytest.fixture
def test_flag():
    """A flag that exists only for one test."""
    feature_flags.FEATURE_FLAGS["testFeature"] = True
    yield
    del feature_flags.FEATURE_FLAGS["testFeature"]


def test_is_enabled_follows_the_flag(test_flag):
    assert is_enabled("testFeature") is True
    feature_flags.FEATURE_FLAGS["testFeature"] = False
    assert is_enabled("testFeature") is False


def test_only_the_boolean_true_counts_as_on(test_flag):
    feature_flags.FEATURE_FLAGS["testFeature"] = "False"
    assert is_enabled("testFeature") is False


def test_unknown_flag_raises_outside_production(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    with pytest.raises(KeyError, match="noSuchFeature"):
        is_enabled("noSuchFeature")


def test_unknown_flag_logs_and_counts_as_on_in_production(monkeypatch, capsys):
    monkeypatch.setenv("ENV", "production")
    assert is_enabled("noSuchFeature") is True
    assert "noSuchFeature" in capsys.readouterr().out


def test_require_feature_rejects_a_typo_when_the_route_is_defined():
    with pytest.raises(KeyError, match="noSuchFeature"):
        require_feature("noSuchFeature")  # even with ENV=production, as in these tests


def test_every_real_flag_is_a_boolean():
    for name, value in feature_flags.FEATURE_FLAGS.items():
        assert isinstance(value, bool), name


def test_gated_route_answers_503_only_while_the_flag_is_off(client, test_flag):
    @main.app.get("/gated-test-route", dependencies=[Depends(require_feature("testFeature"))])
    def gated():
        return {"ok": True}

    try:
        assert client.get("/gated-test-route").json() == {"ok": True}

        feature_flags.FEATURE_FLAGS["testFeature"] = False
        response = client.get("/gated-test-route")
        assert response.status_code == 503
        assert response.json() == {"error": "Feature temporarily unavailable", "feature": "testFeature"}

        assert client.get("/opps").status_code == 200  # other routes are untouched
    finally:
        main.app.router.routes[:] = [
            r for r in main.app.router.routes if getattr(r, "path", None) != "/gated-test-route"
        ]
