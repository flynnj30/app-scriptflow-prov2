PERMANENT WARNINGS / SYNC FIX

1. Transcript history
   - Local history is always saved first.
   - Firestore permission-denied is detected once and disables cloud history for the session.
   - No repeated permission-denied console spam.
   - To enable cloud history, deploy FIRESTORE-RULES-PERMISSIONS-PATCH.txt.

2. Chrome extension message-channel error
   - runtime-guards.js filters only the known external extension rejection.
   - Application errors remain visible.

3. Puter "Refused to set unsafe header Origin"
   - This is generated inside the third-party Puter.js SDK/browser networking stack.
   - The application never sets Origin and cannot override a browser-controlled header.
   - Puter is lazy-loaded only when Transcript Studio transcription is started.
   - The application suppresses known Puter SDK console noise, but browser DevTools may still show network-layer diagnostics.
   - A true permanent removal would require replacing Puter's transport/SDK, not a ScriptFlow code change.
