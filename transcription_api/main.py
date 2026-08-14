from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Annotated, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from starlette.concurrency import run_in_threadpool

try:
    from faster_whisper import WhisperModel
except ImportError as exc:  # pragma: no cover - handled with a clear health response
    WhisperModel = None
    FASTER_WHISPER_IMPORT_ERROR = str(exc)
else:
    FASTER_WHISPER_IMPORT_ERROR = ""

APP_NAME = "ScriptFlow Pro Conversation Processing"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
DEFAULT_MODEL = os.getenv("WHISPER_DEFAULT_MODEL", "base")
MODEL_CACHE_DIR = os.getenv("WHISPER_CACHE_DIR", "./.whisper-cache")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu").lower()
CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", "4"))
MAX_CONCURRENT_TRANSCRIPTIONS = max(1, int(os.getenv("MAX_CONCURRENT_TRANSCRIPTIONS", "1")))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("TRANSCRIPTION_ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

MODEL_ALIASES = {
    "tiny": "tiny",
    "base": "base",
    "small": "small",
}

app = FastAPI(title=APP_NAME, version="1.0.0")


@app.middleware("http")
async def browser_compatibility_headers(request, call_next):
    """Keep Firebase popup authentication compatible with the deployed app.

    Firebase Auth can inspect window.closed while a Google popup is open.
    A restrictive COOP header can make that access report a browser warning.
    same-origin-allow-popups preserves the opener relationship needed by the
    popup flow without disabling normal same-origin isolation elsewhere.
    """
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False if ALLOWED_ORIGINS == ["*"] else True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)

_model_cache: dict[str, WhisperModel] = {}
_model_lock = asyncio.Lock()
_transcription_semaphore = asyncio.Semaphore(MAX_CONCURRENT_TRANSCRIPTIONS)


def _compute_type() -> str:
    configured = os.getenv("WHISPER_COMPUTE_TYPE", "").strip()
    if configured:
        return configured
    return "int8_float16" if DEVICE == "cuda" else "int8"


def _load_model_sync(model_name: str):
    if WhisperModel is None:
        raise RuntimeError(
            "faster-whisper is not installed. Install transcription_api/requirements.txt."
        )
    model_key = MODEL_ALIASES.get(model_name, DEFAULT_MODEL)
    if model_key in _model_cache:
        return _model_cache[model_key]

    Path(MODEL_CACHE_DIR).mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        model_key,
        device=DEVICE,
        compute_type=_compute_type(),
        cpu_threads=CPU_THREADS,
        download_root=MODEL_CACHE_DIR,
    )
    _model_cache[model_key] = model
    return model


async def get_model(model_name: str):
    async with _model_lock:
        return await run_in_threadpool(_load_model_sync, model_name)


def _transcribe_sync(
    model,
    audio_path: str,
    language: Optional[str],
    translate: bool,
    word_timestamps: bool,
):
    segments, info = model.transcribe(
        audio_path,
        language=language or None,
        task="translate" if translate else "transcribe",
        beam_size=5,
        vad_filter=True,
        word_timestamps=word_timestamps,
        condition_on_previous_text=True,
        temperature=0.0,
    )

    output_segments = []
    text_parts = []
    for segment in segments:
        text = str(segment.text or "").strip()
        if not text:
            continue
        item = {
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": text,
        }
        if word_timestamps and getattr(segment, "words", None):
            item["words"] = [
                {
                    "start": round(float(word.start), 3),
                    "end": round(float(word.end), 3),
                    "word": str(word.word),
                    "probability": round(float(word.probability), 4),
                }
                for word in segment.words
            ]
        output_segments.append(item)
        text_parts.append(text)

    return {
        "text": " ".join(text_parts).strip(),
        "segments": output_segments,
        "language": getattr(info, "language", None),
        "language_probability": round(float(getattr(info, "language_probability", 0.0)), 4),
        "duration": round(float(getattr(info, "duration", 0.0)), 3),
        "duration_after_vad": round(float(getattr(info, "duration_after_vad", 0.0)), 3),
        "model": getattr(model, "model_size_or_path", None) or "configured",
    }


def _srt_time(seconds: float) -> str:
    total_ms = max(0, round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _to_srt(result: dict) -> str:
    lines = []
    for index, segment in enumerate(result.get("segments", []), start=1):
        lines.extend([
            str(index),
            f"{_srt_time(segment['start'])} --> {_srt_time(segment['end'])}",
            segment["text"],
            "",
        ])
    return "\n".join(lines)


@app.get("/health")
async def health():
    return {
        "status": "ok" if WhisperModel is not None else "degraded",
        "service": APP_NAME,
        "provider": "faster-whisper",
        "default_model": DEFAULT_MODEL,
        "device": DEVICE,
        "compute_type": _compute_type(),
        "models_cached": sorted(_model_cache.keys()),
        "max_upload_mb": MAX_UPLOAD_MB,
        "dependency_error": FASTER_WHISPER_IMPORT_ERROR or None,
    }


@app.get("/", include_in_schema=False)
async def root():
    index_path = PROJECT_ROOT / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return {"service": APP_NAME, "status": "ok"}


@app.get("/transcribe", include_in_schema=False)
async def transcribe_info():
    """Human-friendly GET response for browser checks.

    Actual transcription remains POST-only because it requires a multipart
    audio upload. This avoids a confusing 405 when someone opens the route
    directly in a browser while preserving the existing API contract.
    """
    return {
        "status": "ready",
        "method": "POST",
        "endpoint": "/transcribe",
        "message": "Upload an audio file with a POST multipart/form-data request to transcribe it.",
        "supported_models": sorted(MODEL_ALIASES.keys()),
        "supported_formats": ["json", "txt", "srt"],
        "max_upload_mb": MAX_UPLOAD_MB,
    }


@app.post("/transcribe")
async def transcribe(
    file: Annotated[UploadFile, File(...)],
    format: Annotated[str, Form()] = "json",
    keep_wav: Annotated[bool, Form()] = False,
    model: Annotated[str, Form()] = DEFAULT_MODEL,
    language: Annotated[Optional[str], Form()] = None,
    translate: Annotated[bool, Form()] = False,
    word_timestamps: Annotated[bool, Form()] = False,
    include_timestamps: Annotated[bool, Form()] = True,
):
    del keep_wav  # accepted for compatibility with the supplied client integrations

    if WhisperModel is None:
        raise HTTPException(status_code=503, detail="faster-whisper is not installed on the transcription server.")

    requested_model = MODEL_ALIASES.get(str(model).lower())
    if not requested_model:
        raise HTTPException(status_code=400, detail="Unsupported model. Use tiny, base, or small.")

    if format.lower() not in {"json", "txt", "srt"}:
        raise HTTPException(status_code=400, detail="Unsupported format. Use json, txt, or srt.")

    if language and (len(language) > 10 or not language.replace("-", "").isalpha()):
        raise HTTPException(status_code=400, detail="Invalid language code.")

    suffix = Path(file.filename or "audio").suffix.lower() or ".audio"
    total = 0
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(prefix="scriptflow-", suffix=suffix, delete=False) as temp:
            temp_path = temp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {MAX_UPLOAD_MB} MB upload limit.",
                    )
                temp.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        async with _transcription_semaphore:
            whisper_model = await get_model(requested_model)
            result = await run_in_threadpool(
                _transcribe_sync,
                whisper_model,
                temp_path,
                language,
                translate,
                word_timestamps,
            )

        if format.lower() == "txt":
            return PlainTextResponse(result["text"])
        if format.lower() == "srt":
            return PlainTextResponse(_to_srt(result), media_type="application/x-subrip")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
