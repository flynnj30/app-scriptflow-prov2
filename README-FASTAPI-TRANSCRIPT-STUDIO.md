# ScriptFlow Pro — FastAPI Transcript Studio

Transcript Studio now uses a **FastAPI + faster-whisper** service for speech-to-text and a **deterministic JavaScript extractor** for booking fields.

No Gemini, Puter AI, Qwen, browser-side LLM, or commercial transcription API is used by this feature.

## Why this architecture

The browser no longer downloads a Whisper model or an LLM. It uploads the recording to the FastAPI service, which runs faster-whisper with CTranslate2. The result contains timestamped segments and is returned as JSON.

The booking parser then extracts fields with deterministic rules. Missing fields remain `Not specified` rather than being guessed.

faster-whisper is open-source and supports CPU INT8 and CUDA execution. It also uses PyAV for audio decoding, so a separate system FFmpeg installation is not required for normal supported audio files. See the project documentation: https://github.com/SYSTRAN/faster-whisper

## Local setup

1. Start the API:

```bash
cd transcription_api
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

2. Point the frontend at it in `index.html`:

```html
<script>
  window.SCRIPTFLOW_TRANSCRIPTION_API_URL = 'http://localhost:8000';
</script>
```

3. Serve the existing ScriptFlow frontend as usual.

## Production

Deploy `transcription_api/` as a separate FastAPI service and set the frontend variable to its HTTPS URL. Configure `TRANSCRIPTION_ALLOWED_ORIGINS` to the exact frontend origin, for example:

```text
https://scriptflow-pro.example.com
```

A free CPU web service can sleep and may be slow for long recordings. For dependable production performance, use a machine with enough RAM/CPU or a GPU. The software itself has no per-minute commercial transcription API requirement.

## Models

- `tiny` — fastest / lowest resource use
- `base` — recommended default balance
- `small` — higher accuracy, slower

The first request for each model downloads it into the configured cache. Later requests reuse the cached model.

## Endpoint compatibility

The supplied Node.js integration used:

```text
POST /transcribe
file=<multipart file>
format=txt|json
keep_wav=false
```

The new endpoint keeps those fields and adds:

- `model=tiny|base|small`
- `language=<language code>`
- `translate=true|false`
- `word_timestamps=true|false`

The frontend uses JSON so it can preserve timestamps and feed the existing Transcript Studio UI.
