"""Render-compatible ASGI entrypoint.
This shim exists so both `uvicorn main:app` and `uvicorn server:app` work.
"""
from server import app

__all__ = ["app"]
