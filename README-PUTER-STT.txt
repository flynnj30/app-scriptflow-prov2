ScriptFlow Pro - Puter AI Transcript Studio

Updated:
- Replaced browser-side Transformers.js/Whisper inference with Puter.js speech2txt.
- Puter.js is loaded from https://js.puter.com/v2/.
- Local File/Blob uploads are passed directly to puter.ai.speech2txt().
- Fast: gpt-4o-mini-transcribe
- Balanced: gpt-4o-transcribe
- Higher accuracy: gpt-4o-transcribe
- Speaker identification: gpt-4o-transcribe-diarize + diarized_json + chunking_strategy auto
- Translation: translate=true
- Result normalization supports segments, words, diarized segments, and plain text.
- Existing transcript result UI, search, playback, summary, mind map, insights, sharing and exports remain in place.
- Removed Transformers.js/Hugging Face model download code, eliminating its content-length and dtype warnings from Transcript Studio.

Notes:
- Puter speech2txt accepts browser File/Blob inputs directly.
- Puter may require user authorization/account access when first using AI.
- The progress percentage is a workflow-stage indicator because speech2txt does not expose a streaming progress callback; it is not presented as a fabricated model-download percentage.


Connection hardening update:
- Puter.js is lazy-loaded only when Transcript Studio starts transcription.
- Puter authentication is requested from the user-initiated Transcribe action when supported.
- Transient network/WebSocket failures are retried once.
- Browser extension errors such as “A listener indicated an asynchronous response...” and ERR_BLOCKED_BY_CLIENT are external to the page and cannot be fixed by application JavaScript; test with extensions disabled to confirm.
