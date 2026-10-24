# BIPIN AI Auto-Agent — implementation notes

## Intended flow
- Existing home page and service list remain unchanged.
- User can open a service and provide their own profile details.
- In the native Android Capacitor app, the official portal opens using `@capgo/inappbrowser`.
- The auto-fill script matches supported fields by labels/name/placeholder and fills matching values.
- On supported forms, the script can click an explicitly labelled `Next`, `Continue`, `Proceed`, or `Save and Continue` button after filling the current page.
- It pauses when a visible CAPTCHA/OTP-like field is detected. Payment is not automated.
- It never intentionally clicks Submit/Apply/Pay/Confirm buttons. Review the form and submit manually.

## Important limitations
- This is not a universal autonomous agent. Portals using canvas forms, shadow DOM, unusual labels, anti-bot controls, file uploads, or inaccessible cross-origin frames may not be automatable.
- Native in-app browser scripting only works when the installed plugin/platform allows script injection. A normal external browser tab cannot inject scripts into a different website origin.
- Uploading photo/signature/documents may require user interaction. Do not store sensitive documents unnecessarily.
- Keep API keys such as `GEMINI_API_KEY` in deployment secrets, never in source code.
- Build/live portal testing is still required after pushing to GitHub Actions. A successful source ZIP is not proof that every portal works.
