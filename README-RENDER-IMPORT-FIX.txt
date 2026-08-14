RENDER IMPORT FIX
==================

The deployment error `Could not import module "main"` occurred because the repository previously exposed `server.py` as the ASGI entrypoint while Render was configured to start `main:app`.

This release adds root-level `main.py` as a compatibility entrypoint and configures Render to use it.

Root Directory: leave blank (repository root)
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health

Do not set Root Directory to `transcription_api`; the frontend and server wrapper are at the repository root.
