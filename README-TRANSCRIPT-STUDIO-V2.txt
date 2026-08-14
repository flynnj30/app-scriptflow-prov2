ScriptFlow Pro - Transcript Studio v2

What changed:
- Rebuilt Transcript Studio into a three-phase workflow:
  1) Upload / drag-and-drop
  2) Transcription settings
  3) Searchable transcript + summary/mind map/insights
- Added browser-based Whisper transcription through Transformers.js.
- Uses WebGPU when available and falls back to WASM CPU mode.
- Supports multilingual transcription and optional English translation.
- Added timestamped transcript segments, synchronized audio playback, search, copy, share, and export.
- Added SRT, VTT, TXT, CSV, Word-compatible DOC, and PDF/Print export.
- Added model choices: Fast / Balanced / Higher accuracy.
- Added progress percentage directly inside the Transcribe for Free button.
- Added clearer errors for unsupported audio formats, network/model failures, and memory limits.
- Added editable speaker labels as a manual feature; automatic speaker diarization is not falsely claimed.
- Added local extractive summary, key points, questions, action items, objections, and a topic mind map.

Accuracy / privacy:
- Whisper runs in the browser through Transformers.js. The selected model is downloaded from the model host on first use and cached by the browser.
- Audio is not uploaded to ScriptFlow's Firebase by this module.
- Browser audio decoding support varies by browser/format. Chromium-based browsers generally provide the broadest support for OGG/Opus/WebM.
- For maximum transcription accuracy, use Balanced or Higher accuracy and a clean recording.

Compatibility:
- Existing ScriptFlow Pro files and feature modules are preserved.
- Only js/transcript-studio.js and the Transcript Studio section of style.css were updated.
