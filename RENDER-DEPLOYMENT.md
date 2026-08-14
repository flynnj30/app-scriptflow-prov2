# ScriptFlow Pro — GitHub → Render Deployment

## Recommended deployment type

ScriptFlow Pro is currently a browser-first HTML/CSS/JavaScript application, so deploy it as a **Render Static Site**.

### Render Dashboard

1. Push the repository to GitHub.
2. In Render: **New → Static Site**.
3. Connect the GitHub repository.
4. Branch: `main` (or your production branch).
5. Root Directory: repository root.
6. Build Command:
   `echo 'ScriptFlow Pro static build: no compilation required'`
7. Publish Directory: `.`
8. Auto Deploy: **On Commit**.
9. Create the site.

The included `render.yaml` can also be used as a Blueprint.

## Firebase

Keep Firebase browser configuration in the frontend only if it contains the normal Firebase Web App configuration. It is not a substitute for security. Protect data with Firestore Security Rules and Firebase Authentication.

Never put a Firebase Admin SDK service-account private key, Puter secret/API key, database password, or other server credential in `index.html`, `js/`, or any browser-delivered file.

## Source-code visibility

A static web application cannot be made truly source-private. The browser must download HTML/CSS/JavaScript to execute it, so users can inspect or retrieve it through View Source, DevTools, or the Network panel.

Minification/obfuscation can raise the effort required to read code, but it is not a security boundary and should not be used to hide secrets.

For genuinely private logic:

- Move it to a server-side API/backend.
- Keep secrets in Render Environment Variables or secret files.
- Have the browser call the backend over HTTPS.
- Enforce authorization server-side and in Firebase Rules where applicable.

## Safe production hardening included

The Blueprint adds:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- HSTS for HTTPS
- Short revalidation caching for JS/CSS

A restrictive Content-Security-Policy is intentionally not enabled automatically because this project currently depends on multiple external CDNs and third-party SDKs. Add CSP only after auditing every script, style, font, image, WebSocket, and connection endpoint.
