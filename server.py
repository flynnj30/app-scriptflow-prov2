from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "250"))

app = FastAPI(title="ScriptFlow Pro Transcription Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app-scriptflow-pro.onrender.com",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Firebase Google authentication no longer uses popup authentication in the app,
# but this header remains compatible with popup-capable integrations.
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response

_models = {}
_model_lock = asyncio.Lock()


def get_model(model_name: str):
    if model_name in _models:
        return _models[model_name]
    from faster_whisper import WhisperModel
    model = WhisperModel(
        model_name,
        device=MODEL_DEVICE,
        compute_type=MODEL_COMPUTE_TYPE,
    )
    _models[model_name] = model
    return model


async def get_model_async(model_name: str):
    async with _model_lock:
        return await asyncio.to_thread(get_model, model_name)


@app.get("/health")
async def health():
    try:
        import faster_whisper  # noqa: F401
        dependency = "ready"
    except Exception as exc:
        dependency = f"missing: {type(exc).__name__}"
    return {
        "status": "ok",
        "service": "scriptflow-transcription",
        "engine": "faster-whisper",
        "model": MODEL_NAME,
        "device": MODEL_DEVICE,
        "compute_type": MODEL_COMPUTE_TYPE,
        "dependency": dependency,
        "model_loaded": MODEL_NAME in _models,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    translate: bool = Form(False),
    include_timestamps: bool = Form(True),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No audio file was supplied.")

    suffix = Path(file.filename).suffix.lower()
    allowed = {".opus", ".ogg", ".oga", ".webm", ".mp3", ".wav", ".m4a", ".mp4", ".aac", ".flac"}
    if suffix not in allowed:
        raise HTTPException(status_code=415, detail="Unsupported audio/video format.")

    selected_model = (model or MODEL_NAME).strip().lower()
    if selected_model not in {"tiny", "base", "small"}:
        selected_model = MODEL_NAME

    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_MB} MB limit.")
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(data)
            temp_path = temp.name

        # Model selection is intentionally restricted to the three tested local
        # profiles. This prevents arbitrary model paths from user input.
        whisper = await get_model_async(selected_model)
        task = "translate" if translate else "transcribe"
        lang = None if not language or language.lower() in {"auto", "", "detect"} else language.lower()

        segments, info = await asyncio.to_thread(
            whisper.transcribe,
            temp_path,
            language=lang,
            task=task,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=True,
        )

        result_segments = []
        text_parts = []
        for segment in segments:
            text = str(segment.text or "").strip()
            if not text:
                continue
            text_parts.append(text)
            if include_timestamps:
                result_segments.append({
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "text": text,
                })

        text = " ".join(text_parts).strip()
        if not text:
            raise HTTPException(status_code=422, detail="No speech was detected in the recording.")

        duration = result_segments[-1]["end"] if result_segments else float(getattr(info, "duration", 0) or 0)
        return JSONResponse({
            "text": text,
            "segments": result_segments,
            "language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "duration": duration,
            "model": selected_model,
            "task": task,
            "filename": file.filename,
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


@app.get("/")
async def root():
    return FileResponse(ROOT / "index.html")


# Static files are mounted last so /health and /transcribe always win.
app.mount("/", StaticFiles(directory=ROOT, html=True), name="static")
