SCRIPTFlow Pro - Transcript Studio 404 FINAL FIX

The browser error:
  GET /health -> 404
  POST /transcribe -> 404

is a deployment-routing problem, not a Whisper extraction problem.

This package fixes it by:
1. Running FastAPI directly with: uvicorn server:app --host 0.0.0.0 --port $PORT
2. Defining /health and /transcribe in the FastAPI application.
3. Adding Render healthCheckPath: /health.
4. Removing package.json so Render cannot accidentally use the old Node/static start command.
5. Pointing Transcript Studio at https://app-scriptflow-pro.onrender.com by default.
6. Keeping SCRIPTFLOW_TRANSCRIPTION_API_URL as an override for other deployments.

RENDER SETTINGS (for the EXISTING app-scriptflow-pro service)
Runtime: Python 3
Build Command: pip install -r requirements.txt
Start Command: uvicorn server:app --host 0.0.0.0 --port $PORT
Health Check Path: /health

IMPORTANT:
If the existing Render service still has a Node/static start command in the dashboard,
change it manually. A render.yaml only affects a service when Render actually deploys
from that Blueprint/configuration; it does not magically replace dashboard settings on
an already-created service.

After deployment, verify:
  https://app-scriptflow-pro.onrender.com/health

Expected HTTP status: 200
Expected JSON field:
  "status": "ok"

If /health is still 404 after using the Python start command, the request is not reaching
this FastAPI application and the Render service is still running the old/static process.

Whisper remains self-hosted via faster-whisper. No Gemini, Puter, or paid transcription API
is used. The service requires the dependencies in requirements.txt to be installed.


FINAL PRODUCTION ENDPOINT
https://app-scriptflow-prov2.onrender.com/health

The frontend now defaults to app-scriptflow-prov2.onrender.com.
The Render service name and health check are aligned to the same deployment.
Firebase popup compatibility uses Cross-Origin-Opener-Policy: same-origin-allow-popups.
The asynchronous message-channel console error is extension-generated and is not application code.
