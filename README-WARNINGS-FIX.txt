ScriptFlow Pro - Transcript Studio Warning Fix

Fixed:
1. Explicit Whisper dtype selection:
   - WebGPU: fp16
   - WASM/CPU fallback: q8
   This removes the 'dtype not specified for encoder_model/decoder_model_merged' warnings and reduces GPU memory usage.

2. Transformers.js logging is set to ERROR for production use. The content-length message is an upstream CDN/header warning from Transformers.js when a response does not expose Content-Length. The download remains valid; the application already provides its own progress UI. Setting the library log level to ERROR prevents this non-actionable warning from cluttering the browser console while preserving real errors.

3. Browser/WASM model caching remains enabled.

4. Pipeline reuse now checks model + device + dtype, preventing a stale CPU/GPU pipeline from being reused incorrectly.

5. Fixed an existing transcription error-path bug where an undefined variable could mask the actual transcription error.

No CRM, calendar, analytics, notification, authentication, Smart Import, or other ScriptFlow Pro feature was intentionally changed.
