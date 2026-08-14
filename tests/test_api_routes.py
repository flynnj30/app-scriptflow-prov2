import sys
import types

# Keep the route tests offline: do not download a Whisper model.
fake = types.ModuleType("faster_whisper")
fake.WhisperModel = type("WhisperModel", (), {})
sys.modules.setdefault("faster_whisper", fake)

from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "ScriptFlow Pro Conversation Processing"


def test_transcribe_info():
    response = client.get("/transcribe")
    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "POST"
    assert body["endpoint"] == "/transcribe"


def test_transcribe_requires_upload():
    response = client.post("/transcribe")
    assert response.status_code == 422
