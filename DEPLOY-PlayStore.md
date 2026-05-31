# Play Store Deployment Guide — Hospital Queue (TWA)

> **Architecture note**: Hospital Queue is a **Next.js web application**, not a native Android
> app. It reaches the Play Store as a **Trusted Web Activity (TWA)** — a zero-JavaScript-bridge
> Chrome shell that serves your existing URL at full-screen. The same codebase powers the browser,
> the TWA app, and the iOS "Add to Home Screen" experience. No React Native rewrite needed.

---

## Is the App Play Store–Ready?

| Criterion | Status | Notes |
|---|---|---|
| HTTPS production URL | ✅ Required | Covered by DEPLOY-DO.md / DEPLOY.md |
| PWA manifest | ✅ Added | `public/manifest.json` (this PR) |
| Service worker | ✅ Added | `@ducanh2912/next-pwa` auto-generates via Workbox |
| App icons (192 & 512 px) | ⚠️ Generate | Run `scripts/generate-icons.mjs` (see Step 1) |
| Digital Asset Links | ⚠️ Fill SHA256 | `public/.well-known/assetlinks.json` (see Step 3) |
| Google Play Console account | ⚠️ One-time | USD 25 registration fee |
| Target API level ≥ 34 | ✅ Bubblewrap handles | Auto-set by Bubblewrap |
| App content policy | ✅ Health/medical | Permitted category; no age gate needed |
| Privacy policy URL | ⚠️ Required | Must be live before first submission |

**Verdict**: The code is ready. You need to (a) generate icons, (b) deploy to production so
`.well-known/assetlinks.json` is live, (c) run Bubblewrap once to produce the AAB, and (d) fill
out the Play Console listing. Budget **half a day** for a first-time submitter.

---

## Prerequisites

```
Node ≥ 18
Java JDK 17        (Bubblewrap signs the APK with keytool)
Android SDK        (optional — Bubblewrap downloads it if absent)
A production HTTPS URL for your app  (e.g. https://hq.yourdomain.com)
```

Install the toolchain once:

```bash
npm install -g @bubblewrap/cli
# verify
bubblewrap --version
```

---

## Step 1 — Generate PWA Icons

The manifest references five icon files. Generate them with the included script:

```bash
# In the repo root
cd apps/web
npm install canvas          # temporary dev dep — only needed for this script
node scripts/generate-icons.mjs
```

You should see:

```
✓ public/icons/icon-96.png
✓ public/icons/icon-192.png
✓ public/icons/icon-192-maskable.png
✓ public/icons/icon-512.png
✓ public/icons/icon-512-maskable.png
```

> **Tip**: If you have a designer, swap the generated files with brand-accurate artwork at the
> same sizes. The maskable variants need at least 10 % safe-zone padding around the logo — the
> generator already handles this.

Add icons to git and push:

```bash
git add apps/web/public/icons/
git commit -m "chore: add PWA icons"
git push origin aa/feat/app
```

---

## Step 2 — Add Screenshots (Play Store Required)

Play Store requires at least **2 phone screenshots** (1080 × 1920 px recommended).

Suggested shots:
1. Patient portal — active queue card showing token + ETA
2. Reception dashboard — queue list with Next Patient button
3. Doctor dashboard — their queue at a glance

Save them as:
```
apps/web/public/screenshots/patient-queue.png
apps/web/public/screenshots/reception-dashboard.png
```

These are referenced in `manifest.json` → `screenshots[]`. The Play Store listing will ask
you to upload them separately as well (drag-and-drop in the console).

---

## Step 3 — Wire Digital Asset Links

TWA requires your domain to *prove* it owns the app. This is done via
`/.well-known/assetlinks.json` served from your live HTTPS domain.

### 3a — Create a signing keystore (do this once, keep it forever)

```bash
keytool -genkeypair \
  -alias hospitalqueue \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore hospitalqueue.keystore \
  -storetype JKS
```

You will be prompted for a password and distinguished name (name, org, city, country).
**Back up this keystore file — you can never change it once the app is published.**

Store safely:
```
hospitalqueue.keystore  → encrypted backup (S3, Bitwarden, etc.)
keystore password       → password manager
```

### 3b — Get the SHA-256 certificate fingerprint

```bash
keytool -list -v \
  -keystore hospitalqueue.keystore \
  -alias hospitalqueue \
  | grep "SHA256:"
```

Copy the colon-separated hex string, e.g.:
```
AB:CD:12:34:...  (32 pairs)
```

### 3c — Update assetlinks.json

Edit `apps/web/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.hospitalqueue.app",
      "sha256_cert_fingerprints": [
        "AB:CD:12:34:..."
      ]
    }
  }
]
```

> Use your actual fingerprint and your chosen package name. Once published, the package name
> is permanent — choose it now (`com.yourcompany.hospitalqueue` is cleaner than the default).

Commit and deploy — the file must be live at:
```
https://hq.yourdomain.com/.well-known/assetlinks.json
```

Verify with Google's tool after deploy:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://hq.yourdomain.com&relation=delegate_permission/common.handle_all_urls
```

---

## Step 4 — Verify PWA Score

Before generating the AAB, confirm the deployed site passes PWA requirements:

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run against your live URL
lighthouse https://hq.yourdomain.com \
  --only-categories=pwa \
  --output=html \
  --output-path=./lighthouse-pwa.html
open ./lighthouse-pwa.html
```

Target: **PWA score ≥ 80** (green). The manifest + service worker added in this branch should
get you there. Common failures and fixes:

| Lighthouse finding | Fix |
|---|---|
| "No manifest" | Deploy the branch; check `/manifest.json` loads in browser |
| "SW not registered" | `NODE_ENV=production` build — SW is disabled in dev mode |
| "Icons missing" | Run Step 1 and push |
| "Not HTTPS" | Must be on your production domain, not localhost |
| "Maskable icon missing" | Use `icon-192-maskable.png` — already in manifest |

---

## Step 5 — Generate the Android AAB with Bubblewrap

```bash
mkdir hq-twa && cd hq-twa
bubblewrap init --manifest https://hq.yourdomain.com/manifest.json
```

Bubblewrap reads your live manifest and asks you a series of questions:

| Prompt | Recommended answer |
|---|---|
| Application ID | `com.hospitalqueue.app` (or your brand) |
| App name | `Hospital Queue` |
| Short name | `HQ` |
| Host URL | `https://hq.yourdomain.com` |
| Start URL | `/` |
| Theme color | `#1d6dff` |
| Background color | `#0f172a` |
| Icon URL | `https://hq.yourdomain.com/icons/icon-512.png` |
| Maskable icon URL | `https://hq.yourdomain.com/icons/icon-512-maskable.png` |
| Signing key path | `../hospitalqueue.keystore` |
| Key alias | `hospitalqueue` |
| Signing key password | (your keystore password) |
| Android SDK path | (press Enter to auto-download if not installed) |

After answering, Bubblewrap generates an Android project. Build the signed AAB:

```bash
bubblewrap build
```

This produces:
```
app-release-signed.apk    ← for local testing on a physical device
app-release-bundle.aab    ← this is what you upload to Play Store
```

Test the APK on a real Android device before submitting:

```bash
adb install app-release-signed.apk
```

Open the app. It should open your site **full-screen with no browser chrome**. If you see the
Chrome address bar, the Digital Asset Links verification failed — re-check Step 3.

---

## Step 6 — Google Play Console Setup

### 6a — Create developer account

1. Go to [play.google.com/console](https://play.google.com/console)
2. Sign in with a Google account (use a business account, not personal)
3. Pay the **one-time USD 25** registration fee
4. Fill in developer name, address, phone

### 6b — Create the app

1. Click **Create app**
2. App name: `Hospital Queue`
3. Default language: `English (India) — en-IN`
4. App or Game: **App**
5. Free or Paid: **Free** (you can add in-app purchases later; cannot switch paid→free once published)
6. Accept policies → **Create app**

### 6c — Fill the store listing

Navigate to **Grow → Store presence → Main store listing**:

| Field | Content |
|---|---|
| Short description (80 chars) | `Real-time token queues for clinics — no waiting room guessing` |
| Full description (4000 chars) | See template below |
| App icon | Upload `icon-512.png` |
| Feature graphic | 1024 × 500 px banner (design in Canva) |
| Phone screenshots | At least 2, from Step 2 |
| Category | **Medical** |
| Tags | `hospital`, `clinic`, `queue`, `patient`, `OPD` |
| Website | `https://hq.yourdomain.com` |
| Privacy policy | `https://hq.yourdomain.com/privacy` ← must exist! |

**Full description template:**

```
Hospital Queue gives every patient a live digital token the moment they check in at a clinic — 
no paper chit, no shouting names, no guessing.

FOR PATIENTS
• Get a token on your phone instantly after check-in at the reception
• Watch your position in real time — updates in under a second
• See minute-accurate ETA for when the doctor will call you
• Works entirely in the browser — nothing to download or install

FOR CLINICS
• Reception desk manages the entire queue from one screen
• Doctors see their live queue and mark patients as seen with one tap
• Multi-clinic support — one admin manages all branches
• Invite codes let new staff join the right clinic automatically

BUILT FOR INDIA
• Works on slow 4G connections
• No data stored outside India (DigitalOcean Bangalore BLR1)
• SMS OTP login for patients — no password to remember

Hospital Queue is free for clinics to try. Contact us at [your email] to get started.
```

---

## Step 7 — Privacy Policy Page (Required)

Play Store will reject the app without a live privacy policy URL. Add a minimal one:

Create `apps/web/app/privacy/page.tsx`:

```tsx
export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-gray-300">
      <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="mb-4">Last updated: {new Date().toLocaleDateString('en-IN')}</p>

      <h2 className="text-lg font-semibold text-white mt-8 mb-2">Data We Collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Phone number (patients) — for OTP login and queue association</li>
        <li>Name and contact details (clinic staff) — for account creation</li>
        <li>Queue activity — token number, timestamps, doctor assignment</li>
      </ul>

      <h2 className="text-lg font-semibold text-white mt-8 mb-2">How We Use It</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>To manage patient queues in real time</li>
        <li>To send OTP messages for login</li>
        <li>We do not sell, rent, or share your data with third parties</li>
      </ul>

      <h2 className="text-lg font-semibold text-white mt-8 mb-2">Data Storage</h2>
      <p>All data is stored on servers located in Bangalore, India (DigitalOcean BLR1).</p>

      <h2 className="text-lg font-semibold text-white mt-8 mb-2">Data Deletion</h2>
      <p>Email <a href="mailto:YOUR_EMAIL" className="text-blue-400">YOUR_EMAIL</a> to request deletion of your account and associated data. We will process the request within 30 days.</p>

      <h2 className="text-lg font-semibold text-white mt-8 mb-2">Contact</h2>
      <p>YOUR_EMAIL</p>
    </main>
  );
}
```

Deploy this before submitting to Play Store.

---

## Step 8 — Content Rating

Play Store requires you to fill a content rating questionnaire:

1. Go to **Policy → App content → Content rating**
2. Click **Start questionnaire**
3. Category: **Utility**
4. Answer all questions (no violence, no sexual content, no user-generated content for public)
5. Submit → you'll receive an **Everyone** or **Everyone 10+** rating

---

## Step 9 — Upload the AAB and Create a Release

1. Go to **Release → Testing → Internal testing** (start here — instant rollout, 100 testers)
2. Click **Create new release**
3. Upload `app-release-bundle.aab`
4. Release name: `1.0.0`
5. Release notes: `Initial release of Hospital Queue`
6. **Save → Review release → Start rollout**

Test with your own Gmail account added as an internal tester. Once happy:

1. **Testing → Closed testing (Alpha)** — invite 10-20 clinic staff
2. After 2+ weeks → **Open testing (Beta)** — open to India
3. Final step → **Production** → set rollout to 20 % first, then 100 %

> **Review time**: First-time apps typically take **3–7 business days** for Play Store review.
> Updates to existing apps are usually reviewed within **hours**.

---

## Step 10 — Versioning for Future Updates

Every time you update the web app, the TWA picks it up automatically (it's just a URL). You
only need to publish a new AAB when:

- `versionCode` / `versionName` needs a bump (Play Store increments)
- You change the package name, signing key, or TWA config
- You add/remove Android permissions

To bump version, edit `hq-twa/twa-manifest.json`:

```json
{
  "appVersionCode": 2,
  "appVersionName": "1.1.0"
}
```

Then rebuild:
```bash
cd hq-twa
bubblewrap build
```

---

## Cost Summary

| Item | Cost |
|---|---|
| Google Play Console account | USD 25 (one-time) |
| Bubblewrap CLI | Free |
| TWA hosting | Already covered by your DO droplet ($6/month) |
| Google Play transaction fee (if paid features) | 15–30 % of IAP revenue |
| **Total to publish** | **USD 25** |

---

## Checklist Before Submitting

```
[ ] Icons generated and committed (Step 1)
[ ] Screenshots captured (Step 2)
[ ] assetlinks.json live at /.well-known/assetlinks.json (Step 3)
[ ] Lighthouse PWA score ≥ 80 (Step 4)
[ ] AAB builds without errors (Step 5)
[ ] APK tested on real Android device — no Chrome bar visible (Step 5)
[ ] Play Console account created (Step 6)
[ ] Store listing complete with description, screenshots, icon (Step 6)
[ ] Privacy policy page live (Step 7)
[ ] Content rating filled (Step 8)
[ ] Internal testing release uploaded (Step 9)
[ ] At least one internal tester has opened the app successfully (Step 9)
```

---

## Troubleshooting

### Chrome address bar is visible inside the app
The TWA verification failed. Causes:
- `assetlinks.json` not served at the correct URL (check with the Google validation API in Step 3)
- SHA-256 fingerprint doesn't match the keystore used to sign the APK
- `package_name` in `assetlinks.json` doesn't match the `applicationId` in Bubblewrap config

### "App not installed" when sideloading APK
Enable **Install from unknown sources** in Android settings → Security.

### Play Store rejects the AAB: "Target API level must be ≥ 34"
Run `bubblewrap update` to get the latest Android Gradle plugin, then rebuild.

### Play Store rejects: "Missing privacy policy"
Ensure the URL in the console (`https://hq.yourdomain.com/privacy`) returns HTTP 200 and
renders visible text. An empty page or redirect loop will fail review.

### Lighthouse: "Manifest icons do not meet the minimum size"
512 × 512 is the minimum. Re-run the icon generator and confirm `public/icons/icon-512.png`
is exactly 512 × 512 px.

---

## Quick Reference Commands

```bash
# Generate icons (one-time)
node apps/web/scripts/generate-icons.mjs

# Verify assetlinks after deploy
curl https://hq.yourdomain.com/.well-known/assetlinks.json

# Lighthouse PWA audit
lighthouse https://hq.yourdomain.com --only-categories=pwa

# Init TWA project (one-time)
mkdir hq-twa && cd hq-twa
bubblewrap init --manifest https://hq.yourdomain.com/manifest.json

# Build signed AAB
bubblewrap build

# Test on device
adb install app-release-signed.apk
```
