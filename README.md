# MedReach

Email marketing platform for the medical sector. Send personalized, compliant
campaigns to clinics and practices from your own Gmail or Microsoft 365 mailbox,
with mail merge, AI-assisted content, and an audit trail.

Built with **Next.js (App Router) + Firebase**, deployable to **Vercel**.

---

## What's included (MVP foundation)

| Area | Status |
| --- | --- |
| **Auth** — email/password, Google & Microsoft sign-in | ✅ |
| **MFA** — TOTP (authenticator app) enrollment + challenge | ✅ |
| **Multi-tenant orgs** — each user gets an isolated workspace | ✅ |
| **Contacts & lists** — CSV upload (dedupe/upsert) + provided sample list | ✅ |
| **Mail merge** — `{{firstName}}`, `{{practiceName}}`, custom CSV columns | ✅ |
| **AI content** — subject/body copy (Claude) + images (OpenAI) | ✅ |
| **Sending** — via connected Gmail (Gmail API) or M365 (Graph) mailbox | ✅ |
| **Compliance** — CAN-SPAM footer, postal address, 1-click unsubscribe | ✅ |
| **Email history / audit log** | ✅ |

See [Roadmap](#roadmap) for what a production rollout still needs.

---

## Architecture

```
Browser (Firebase Auth: login, MFA)
   │  ID token → httpOnly session cookie
   ▼
Next.js on Vercel
   ├─ Server components / route handlers  ── Firebase Admin SDK ──▶ Firestore
   ├─ AI routes ──▶ Anthropic (text), OpenAI (images)
   └─ Send pipeline ──▶ Gmail API / Microsoft Graph (user's mailbox)
```

**Why mailbox connection is separate from login:** bulk sending needs a
long-lived **refresh token** with `gmail.send` / `Mail.Send` scope. Firebase's
sign-in popup doesn't provide that, so connecting a send-mailbox is its own
server-side OAuth flow (`/api/integrations/*`). Refresh tokens are encrypted at
rest (AES-256-GCM) before being stored in Firestore.

Key directories:

- `src/lib/firebase/` — client & (lazy) admin SDK setup
- `src/lib/auth/` — session cookies, org context, client sign-in/MFA helpers
- `src/lib/email/` — mail merge, MIME builder, compliance, Gmail/Graph senders
- `src/lib/ai/` — Claude text + OpenAI image generation with medical guardrails
- `src/app/(app)/` — authenticated UI (dashboard, contacts, campaigns, settings)
- `src/app/api/` — route handlers

---

## Setup

### 1. Prerequisites
- Node.js 20+
- A Firebase project
- Google Cloud & Azure app registrations (for mailbox sending)
- Anthropic API key (text); OpenAI API key (optional, images)

### 2. Firebase
1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method:** enable Email/Password, Google, and
   Microsoft. Under Advanced, enable **Multi-factor authentication (TOTP)**.
3. **Firestore:** create a database (production mode).
4. **Project settings → Your apps:** add a Web app; copy the config into the
   `NEXT_PUBLIC_FIREBASE_*` vars.
5. **Project settings → Service accounts:** generate a private key; copy the
   values into the `FIREBASE_ADMIN_*` vars.
6. Deploy the security rules: `npx firebase deploy --only firestore:rules`.

### 3. Google OAuth (Gmail sending)
1. Google Cloud Console → enable the **Gmail API**.
2. Credentials → create an **OAuth client (Web)**.
3. Authorized redirect URI: `{APP_URL}/api/integrations/google/callback`.
4. Copy client id/secret into `GOOGLE_OAUTH_*`.

### 4. Microsoft OAuth (M365 sending)
1. Azure Portal → App registrations → new registration.
2. Redirect URI (Web): `{APP_URL}/api/integrations/microsoft/callback`.
3. API permissions (delegated, Microsoft Graph): `Mail.Send`, `User.Read`,
   `offline_access`, `openid`, `email`.
4. Certificates & secrets → new client secret. Copy into `MICROSOFT_OAUTH_*`.

### 5. Environment
```bash
cp .env.example .env.local
# fill in every value; generate the token key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 6. Run
```bash
npm install
npm run dev
# http://localhost:3000
```

---

## Using it

1. **Sign up**, then complete onboarding (org name + **postal address** — legally
   required in every marketing email).
2. **Settings → Connected mailboxes:** connect Gmail or Microsoft.
3. **Settings → Account security:** enable 2FA (recommended).
4. **Contacts:** upload a CSV or click *Load sample medical list*.
   - Recognized columns: `email, firstName, lastName, practiceName, specialty,
     city`. Extra columns become custom merge fields (`{{custom.<column>}}`).
5. **New campaign:** write copy (or use the AI assistant), pick a list and
   mailbox, preview the merge, and send. A compliant footer + unsubscribe link
   is appended automatically.

---

## Compliance notes (read before sending)

This tool targets **B2B** medical marketing (clinics, practices, referrers).

- Every email carries the sender's postal address and a working unsubscribe link
  (CAN-SPAM). Unsubscribed contacts are automatically skipped on future sends.
- Sending happens through **your** mailbox, so your provider's daily sending
  limits and anti-spam policies apply. Don't import purchased/non-consented
  lists — it risks your mailbox reputation and violates provider terms.
- **Do not** put patient data / PHI in campaigns. If your use case involves
  patients, you're moving into HIPAA territory (BAAs, consent, audit) — that
  needs the stricter safeguards listed in the roadmap.
- You are responsible for compliance with CAN-SPAM, GDPR/CASL, and any
  healthcare-specific rules in your jurisdiction.

---

## Roadmap

Deliberately out of scope for this MVP foundation; the data model already
accounts for most of it:

- **Background send queue** — the current sender runs synchronously in a route
  handler (fine for modest lists). Large sends should move to a queue/cron
  (e.g. Cloud Tasks or a Vercel cron + batch cursor).
- **Scheduled campaigns** (`status: "scheduled"` exists; needs a cron trigger).
- **Reusable templates UI** (`templates` collection is modeled).
- **Open/click tracking** (pixel + link wrapping).
- **Team members & invites** (roles are modeled; invite flow TODO).
- **Bounce/complaint handling** from provider webhooks.
- **Patient/HIPAA mode** — PHI-free enforcement, consent records, BAA-covered
  infrastructure.

---

## Scripts

```bash
npm run dev        # local dev
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## Deploy to Vercel

1. Push to a Git repo and import into Vercel.
2. Add every variable from `.env.example` in the Vercel project settings.
3. Set `NEXT_PUBLIC_APP_URL` to your production URL, and add that domain's
   `/api/integrations/*/callback` URLs to your Google and Azure app configs.
4. On Vercel Pro/Enterprise, the send route's `maxDuration = 300` allows longer
   batches; on Hobby, keep lists small or move to the queue (see roadmap).
