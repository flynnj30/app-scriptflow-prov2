# ScriptFlow Pro — Render + Firebase Authentication Fix

## Required Firebase Console configuration

Because the frontend is hosted on Render while Firebase Authentication is the identity service, the exact Render hostname must be authorized.

Firebase Console → Authentication → Settings → Authorized domains:

- `app-scriptflow-pro.onrender.com` (replace with the exact Render hostname if different)
- `scriptflow-pro-2cf4c.firebaseapp.com`
- `localhost` only for local development if needed

Also verify Authentication → Sign-in method → Google is enabled, and Email/Password is enabled if using email login.

## Why this build changed Google login

The previous build used `signInWithRedirect()` from a Render-hosted frontend. Firebase documents that redirect authentication on hosts other than Firebase Hosting can require additional cross-origin storage/redirect-domain configuration. This build uses `signInWithPopup()` as the primary Google flow, which avoids that redirect-storage dependency.

If the browser blocks the popup, allow popups for the Render domain and retry.

## Render settings

- Static Site
- Publish Directory: `.`
- Build Command: `echo 'ScriptFlow Pro static build'`
- Auto Deploy: On Commit

Do not put Firebase Admin credentials in the frontend.

## Firestore rules

Authentication and Firestore authorization are separate. The existing Firestore rules still need to allow the signed-in user's reads/writes to the collections used by ScriptFlow Pro.
