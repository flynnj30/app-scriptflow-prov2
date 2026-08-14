# ScriptFlow Pro — Production Conversation Processing

## Architecture

The project uses a self-hosted FastAPI + faster-whisper service. No Gemini, Puter, LLM, or paid transcription API is required.

- `server.py` is the single FastAPI entry point.
- `transcription_api/main.py` contains `/health` and `/transcribe`.
- `js/transcript-studio.js` calls `https://app-scriptflow-prov2.onrender.com` by default.
- `js/app.js` and the existing CRM/calendar modules are preserved.

## Render

Use the repository root as the Render Root Directory (leave it blank).

Build Command:

```bash
pip install -r requirements.txt
```

Start Command:

```bash
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Health Check Path:

```text
/health
```

The included `render.yaml` contains the same settings.

## Production endpoints

- `GET https://app-scriptflow-prov2.onrender.com/health` — service health
- `GET https://app-scriptflow-prov2.onrender.com/transcribe` — human-readable endpoint information
- `POST https://app-scriptflow-prov2.onrender.com/transcribe` — actual multipart audio transcription

## Models

- `tiny` = fastest default
- `base` = balanced accuracy
- `small` = higher accuracy, slower

The frontend exposes all three. The default is `tiny` to minimize wait time. Users can switch to `base` or `small` when accuracy is more important.

## Free-use clarification

The transcription engine is open-source and does not require an AI API key or per-minute API credit. Render hosting itself is subject to Render's current plan, resource, sleep, and bandwidth limits. This is therefore not an unlimited-hosting guarantee.

## Reliability behavior

- Uploads are streamed to a temporary file rather than loaded entirely into RAM.
- Upload size is capped by `MAX_UPLOAD_MB`.
- Only one transcription runs at a time by default on the small CPU service.
- Model loading is cached for the lifetime of the Render instance.
- The browser uses a health check, upload progress, timeout handling, and friendly errors.
- `GET /transcribe` no longer returns an unnecessary 405 when opened manually.
