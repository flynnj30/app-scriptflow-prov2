HEALTH /transcribe 404 FIX

The previous package could be deployed by Render as a static Node service,
which meant /health and /transcribe returned 404. This version is explicitly
Python/FastAPI at the repository root.

Render:
  Build: pip install -r requirements.txt
  Start: uvicorn server:app --host 0.0.0.0 --port $PORT

After deployment:
  GET /health
  POST /transcribe

Do not use `npx serve` as the production start command.
If an existing Render service still has Node selected, update that service to
the Python runtime or create a new service from this render.yaml.
