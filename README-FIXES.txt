ScriptFlow Pro - Authentication Error Fix

1. Google sign-in now uses Firebase signInWithRedirect instead of signInWithPopup.
   This removes the Firebase popup helper's window.closed checks that can be blocked
   by Cross-Origin-Opener-Policy (COOP) on modern browsers.

2. Firebase getRedirectResult() is processed on app startup and authentication state
   remains handled by the existing onAuthStateChanged flow.

3. No application feature, data model, calendar, notifications, analytics, Smart Import,
   or menu structure was changed.

4. The browser console message:
   "A listener indicated an asynchronous response by returning true, but the message
   channel closed before a response was received"
   is typically emitted by a browser extension/content script (often an extension
   listening to web pages), not by Firebase or ScriptFlow Pro. It cannot be reliably
   fixed inside the web app without hiding unrelated errors. Test in Incognito with
   extensions disabled to confirm.


CALENDAR DRAG/DROP + FIREBASE PERMISSIONS FIX
- Drag/drop changes are kept optimistically in local state.
- Firestore snapshots no longer overwrite a pending local move/edit.
- Pending appointment changes survive refresh/offline sessions.
- A successful Firebase write clears only the matching pending version, preventing an older request from clearing a newer edit.
- Permission-denied writes remain locally visible instead of snapping back.
- See FIRESTORE-RULES-PATCH.txt for the required server-side rule change.
- ERR_BLOCKED_BY_CLIENT is normally caused by a browser privacy/ad-blocking extension and is not a Firebase application-code error.
