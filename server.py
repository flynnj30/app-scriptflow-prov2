from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from transcription_api.main import app as transcription_app

BASE_DIR = Path(__file__).resolve().parent

# Keep the transcription FastAPI app as the single application so all existing
# /health and /transcribe routes remain available on the same origin.
app: FastAPI = transcription_app

# Static assets.
if (BASE_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")
if (BASE_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

@app.get("/style.css", include_in_schema=False)
async def stylesheet():
    return FileResponse(BASE_DIR / "style.css", media_type="text/css")
