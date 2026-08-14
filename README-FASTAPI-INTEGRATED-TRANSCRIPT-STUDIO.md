# ScriptFlow Pro — Conversation Notes / FastAPI Processing

## What changed

Transcript Studio no longer uses Puter, Gemini, Qwen, browser LLMs, or a second AI model for booking extraction.

The workflow is now:

1. Upload an audio/video file.
2. ScriptFlow sends it to the bundled `/transcribe` FastAPI endpoint.
3. `faster-whisper` performs speech-to-text on the server.
4. Timestamped segments are returned.
5. The existing deterministic JavaScript extractor builds the booking format.
6. Copy / Smart Import / Calendar / Transcript History continue using the same data flow.

## Why this integration

The supplied Node/Python/Java/C#/PHP/Ruby/Go snippets are clients for a FastAPI `/transcribe` endpoint. They do not provide the transcription engine themselves. This project keeps the endpoint contract from those examples while using the existing `faster-whisper` implementation already present in ScriptFlow Pro. That avoids introducing a missing `opus_to_text` dependency and keeps the existing UI and data flow intact.

## Same-origin deployment

`server.py` mounts the existing ScriptFlow static files and the FastAPI transcription routes into one web service. The browser therefore calls `/transcribe` directly, avoiding a separate API hostname and avoiding frontend CORS configuration in the normal deployment.

## Models

- Fast: Whisper Tiny
- Balanced: Whisper Base
- Higher accuracy: Whisper Small

The default is Tiny to minimize waiting time. Users can choose Base or Small when accuracy is more important.

## Free-use note

The software stack is open source, but hosting and compute are not guaranteed to be free forever. A free hosting tier may sleep, have CPU limits, or impose resource limits. Local/self-hosted deployment avoids per-minute transcription API charges.

## Render

The included `render.yaml` runs the combined FastAPI + static application as a Python web service:

- Build: `pip install -r transcription_api/requirements.txt`
- Start: `uvicorn server:app --host 0.0.0.0 --port $PORT`

No separate frontend/API URL is required for the bundled deployment.
