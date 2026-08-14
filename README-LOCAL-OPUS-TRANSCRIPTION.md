# ScriptFlow Pro — Local OPUS-to-Text

Transcript Studio uses a local `faster-whisper` speech-recognition engine behind FastAPI. It does not call Gemini, Puter, an LLM, or a third-party transcription API.

## Accuracy
No speech-to-text engine can guarantee perfect accuracy for every recording. For the best results use clear audio, low background noise, and the `base` or `small` model when CPU time permits. `tiny` is the fastest option.

## Render
Build: `pip install -r requirements.txt`
Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
Health: `/health`
Transcription: `POST /transcribe` multipart/form-data
