# ScriptFlow Pro FastAPI Whisper Service

This service replaces the browser-side Whisper/Transformers.js and all Gemini/Puter/LLM booking analysis in Transcript Studio.

It uses `faster-whisper` with CTranslate2. The project is open-source and self-hostable; there is no per-minute commercial transcription API requirement. The first request downloads the selected Whisper model and subsequent requests reuse the cached model.

## Run locally

```bash
cd transcription_api
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check: `http://localhost:8000/health`

## Frontend configuration

Set this before `js/transcript-studio.js` loads:

```html
<script>
  window.SCRIPTFLOW_TRANSCRIPTION_API_URL = 'http://localhost:8000';
</script>
```

For same-origin deployment, leave it empty and the frontend will call `/transcribe` and `/health` on the current origin.

## Endpoint

`POST /transcribe` accepts multipart fields:

- `file`: audio/video file
- `format`: `json`, `txt`, or `srt`
- `model`: `tiny`, `base`, or `small`
- `language`: optional ISO language code
- `translate`: `true` to translate speech to English
- `word_timestamps`: `true` for word-level timestamps
- `keep_wav`: accepted for compatibility; no WAV is persisted

## Production notes

A free CPU host can be slow and may sleep. For dependable production performance, run this API on a machine you control or a host with enough CPU/RAM/GPU. The web application itself can remain on a static host.
