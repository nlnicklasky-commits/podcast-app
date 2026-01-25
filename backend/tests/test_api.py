"""API tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.database import init_db


@pytest.fixture(scope="module")
def client():
    """Create test client."""
    init_db()
    return TestClient(app)


def test_root(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Podcast Knowledge Base API"
    assert data["status"] == "running"


def test_health(client):
    """Test health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_list_podcasts_empty(client):
    """Test listing podcasts when empty."""
    response = client.get("/api/podcasts")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_create_podcast_invalid_url(client):
    """Test creating podcast with invalid URL."""
    response = client.post("/api/podcasts", json={"url": "not-a-valid-url"})
    assert response.status_code == 400
    assert "Invalid YouTube URL" in response.json()["detail"]


def test_get_podcast_not_found(client):
    """Test getting non-existent podcast."""
    response = client.get("/api/podcasts/nonexistent-id")
    assert response.status_code == 404


def test_get_job_not_found(client):
    """Test getting non-existent job."""
    response = client.get("/api/jobs/nonexistent-id")
    assert response.status_code == 404


def test_search_empty(client):
    """Test search with no podcasts."""
    response = client.post("/api/search", json={"query": "test query"})
    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []
    assert data["total"] == 0
