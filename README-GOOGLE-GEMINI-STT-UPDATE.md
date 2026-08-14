# ScriptFlow Pro — Puter Speech-to-Text + Google Gemini Analysis

Transcript Studio now uses Puter.js `speech2txt()` for audio transcription and Puter.js `ai.chat()` with Google Gemini for booking-data analysis.

## Transcription
- Fast: `gpt-4o-mini-transcribe`
- Balanced: `gpt-4o-transcribe`
- Higher accuracy: `gpt-4o-transcribe`
- Speaker labels: `gpt-4o-transcribe-diarize`
- Translation/timestamps remain supported where supported by the selected transcription model.

## Booking analysis
- Primary: `google/gemini-3.1-flash-lite`
- Fallback: `google/gemini-2.5-flash`

No Google API key is embedded in the client. Puter manages the AI provider access.

Important: this does not guarantee unlimited usage. Puter/provider quotas, fair-use policies, model availability, or account requirements can change.

## Scope
Only Transcript Studio AI provider/model selection was changed. Calendar, Smart Import, Firebase, appointments, analytics, notifications, tasks, team members, authentication, and other modules remain unchanged.
