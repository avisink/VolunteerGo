from main import keyword_match_score


def ids(response):
    return [rec["id"] for rec in response.json()["recommendations"]]


# --- startup -----------------------------------------------------------------

def test_startup_loads_opportunities_from_api(client):
    client.mock_get.assert_called_once_with("http://localhost:3000/opportunities")

    opps = client.get("/opps").json()
    assert [o["id"] for o in opps] == [1, 2, 3]


def test_startup_builds_search_text_for_each_opportunity(client):
    beach = client.get("/opps").json()[0]
    assert "Name: Beach Cleanup" in beach["text"]
    assert "Organization: Ocean Friends" in beach["text"]


def test_missing_location_is_treated_as_remote(client):
    tutoring = client.get("/opps").json()[2]
    assert "Location: Remote" in tutoring["text"]


def test_startup_survives_api_being_down(client_api_down):
    assert client_api_down.get("/opps").json() == []


# --- keyword scoring -----------------------------------------------------------

def test_keyword_score_weights_fields_differently():
    opp = {
        "name": "beach",
        "description": "beach",
        "tags": ["beach"],
        "skills": [],
        "requirements": [],
        "location": "",
        "organization": {"name": ""},
    }
    # name (3) + description (1) + tags (2)
    assert keyword_match_score(opp, ["beach"]) == 6


def test_keyword_score_is_zero_when_nothing_matches():
    opp = {"name": "Beach Cleanup", "organization": {}}
    assert keyword_match_score(opp, ["piano"]) == 0


# --- POST /search (production / keyword mode) --------------------------------

def test_search_ranks_best_keyword_match_first(client):
    res = client.post("/search", json={"search_prompt": "food bank"})

    assert res.status_code == 200
    assert ids(res)[0] == 2


def test_search_scores_are_normalised_to_top_match(client):
    recs = client.post("/search", json={"search_prompt": "beach"}).json()["recommendations"]

    assert recs[0]["id"] == 1
    assert recs[0]["score"] == 1.0
    assert all(0 <= r["score"] <= 1 for r in recs)


def test_search_matches_location(client):
    res = client.post("/search", json={"search_prompt": "austin"})
    assert ids(res)[0] == 2


def test_search_ignores_stop_words(client):
    with_stop_words = client.post("/search", json={"search_prompt": "the beach and the"}).json()
    without = client.post("/search", json={"search_prompt": "beach"}).json()
    assert with_stop_words == without


def test_search_excludes_saved_opportunities(client):
    res = client.post(
        "/search",
        json={
            "search_prompt": "beach",
            "user_profile": {
                "skills": [],
                "training": [],
                "interests": [],
                "saved_opportunities": [1],
            },
        },
    )
    assert 1 not in ids(res)


def test_search_rejects_missing_prompt(client):
    res = client.post("/search", json={})
    assert res.status_code == 422
