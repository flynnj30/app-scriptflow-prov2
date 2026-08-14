# ScriptFlow Pro — Deterministic Booking Analyzer

## What changed

Transcript Studio no longer loads a second LLM for **Analyze & Populate**. The transcript is transcribed locally with Whisper, then the booking format is populated with deterministic JavaScript rules.

### Booking fields
- Business Name
- Name
- Role
- Phone Number
- Demo Time & Date
- Email
- Notes for the Developer

Missing or ambiguous values remain **Not specified**.

## Transcription models

- Fast: `onnx-community/whisper-tiny`
- Balanced: `onnx-community/whisper-base_timestamped`
- Higher accuracy: `onnx-community/whisper-small_timestamped`

Transformers.js runs these ONNX models in the browser. WebGPU is used when available and WASM is used as the fallback.

## Booking analysis

The Analyze & Populate button does not call an LLM or external booking-analysis API. It uses transcript-supported labels, conservative regex extraction, schedule parsing, interest detection, and rule-based meeting-note generation.

## Existing features

The update is isolated to Transcript Studio. Calendar, Smart Import, Firebase, authentication, analytics, notifications, tasks, scripts, transcript history, and exports remain in the project.
