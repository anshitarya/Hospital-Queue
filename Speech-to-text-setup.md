# Speech-to-Text AI Prescription & WhatsApp Delivery Integration

We have completed the implementation of the speech-to-text prescription generation and WhatsApp Meta Cloud API delivery system. The architecture is built as a set of NestJS microservices packaged in a monorepo structure.

## What was Done

### 1. Database Schema
Pushed the updated [schema.prisma](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/apps/api/prisma/schema.prisma) to PostgreSQL, creating these new tables:
- `Prescription`: Stores clinic identifiers, clinical findings (symptoms, diagnosis, advice, allergies), vitals, and PDF file reference URLs.
- `PrescriptionMedicine`: Stores line-item medicine names, dosages, frequencies, and administration instructions.
- `DoctorPrescriptionConfig`: Stores layout toggle configurations (logo, vitals, margins, and custom letterhead taglines) and order preferences of sections for each doctor.

### 2. Monorepo Microservices
- **API Gateway (`apps/api`)**:
  - Implemented `/api/prescriptions` endpoints to accept audio uploads, retrieve current statuses, and finalize/save drafts.
  - Wired up `BullModule` to dispatch asynchronous jobs to Redis brokers.
- **Prescription Microservice (`apps/prescription-service`)**:
  - Scaffolded the worker application with its own database client compiled against Prisma v5.9.0.
  - Implemented the audio processor `audio.processor.ts` which uses OpenAI Whisper to transcribe audio files, runs the transcript through GPT-4o-mini to build a structured JSON prescription, compiles the layout using `pdfkit`, and uploads the final PDF to S3.
  - Enqueues a `send-whatsapp` job to the notification queue.
- **Notification Microservice (`apps/notification-service`)**:
  - Scaffolded the consumer worker.
  - Created a stateless provider calling the Meta Cloud API via HTTP to send prescription links to patient phone numbers.

### 3. Frontend UI (`apps/web`)
- Created [AudioRecorder.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/apps/web/components/AudioRecorder.tsx) to record audio inside the active consultation screen.
- Created [PrescriptionReview.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/apps/web/components/PrescriptionReview.tsx) to edit clinical findings and add/remove medicine line items before finalizing.
- Added direct Download PDF and browser Print integration inside [PrescriptionReview.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/apps/web/components/PrescriptionReview.tsx) using asynchronous status polling and iframe element injection.
- Created [PrescriptionConfig.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/apps/web/components/PrescriptionConfig.tsx) to adjust template layout and ordering.
- Integrated all components and the Settings Tab inside the doctor's control panel.

### 4. DevOps & Orchestration
- Created Dockerfiles for the two new microservices.
- Added services into [docker-compose.yml](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/docker-compose.yml).
- Modified [dev.sh](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/scripts/dev.sh) to orchestrate and run the entire stack locally in parallel.
- Appended configuration templates for S3 Object Storage and OpenAI inside [.env.example](file:///Users/anshit.arya/Documents/Personal-repos/Hospital%20Queue/.env.example) and the local root `.env`.

---

## Local Verification & Testing

To run the complete system on your local machine, execute:
```bash
./scripts/dev.sh
```

### Steps to Test:
1. Log in to the doctor console at `http://localhost:3000/doctor`.
2. Go to the new **📄 Prescription Config** tab to set up your PDF letterhead styles and section ordering.
3. Start a patient consultation from the queue.
4. Click **Start Recording** to capture dialogue. Once finished, click **Stop Recording**.
5. Wait for the background transcription to complete. The draft form will render on screen.
6. Verify and edit details, then click **Save & Send via WhatsApp**.

---

## Doctor-Level Feature Toggles
To enable/disable AI prescription generation for individual doctors, toggles have been integrated into three different management views:
- **Super Admin Portal (`/admin`)**: A dedicated `AI Rx: On/Off` toggle button is rendered on the doctor row in the clinic doctor management directory.
- **Reception / Manager Portal (`/reception`)**: An `AI Rx: On/Off` button is added inside the doctor status cards under the **Staff** panel (accessible to roles `ADMIN`, `CLINIC_ADMIN`, and `MANAGER`).
- **Doctor Console (`/doctor`)**: The dashboard dynamically checks if the doctor is enabled. If disabled, both the **Prescription Config** settings tab and the microphone consultation recording panels are hidden.
- **API Guard**: The upload and finalization endpoints verify `doctor.prescriptionEnabled` and reject requests with `400 Bad Request` if disabled.

---

## Required Platform API Keys

To activate the speech-to-text integration, configure the following keys inside your root `.env` file:

### 1. OpenAI Platform (Whisper Speech-to-Text & GPT Formatter)
- **`OPENAI_API_KEY`**: Your OpenAI API secret key.
- *Where to get*: Sign up at https://platform.openai.com/api-keys.
- *Cost*: Whisper transcription is priced at **$0.006 per minute** of audio. GPT-4o-mini is extremely inexpensive at **$0.15 per 1M input tokens**.

### 2. Object Storage (For Audio Recordings & PDF Prescriptions)
Any S3-compatible service can be used (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, etc.).
- **`S3_ACCESS_KEY_ID`**: API user access key.
- **`S3_SECRET_ACCESS_KEY`**: API user secret key.
- **`S3_ENDPOINT`**: Object storage service host (e.g. `https://<account-id>.r2.cloudflarestorage.com` for Cloudflare R2).
- **`S3_BUCKET_NAME`**: Name of the bucket (e.g., `hospital-prescriptions`).
- **`S3_REGION`**: Region of the bucket (e.g., `us-east-1` or `auto`).
- **`S3_PUBLIC_URL`**: Public URL of the bucket (e.g., Cloudflare custom domain or public bucket domain to compile links).
- *Where to get*: R2 is highly recommended as it has a generous free tier of **10 GB/month** and zero egress fees.

### 3. WhatsApp Meta Cloud API
- **`META_WA_ACCESS_TOKEN`**: A permanent System User Token generated from your Meta Business Suite.
- **`META_WA_PHONE_NUMBER_ID`**: Found in WhatsApp Getting Started under your Meta App Settings.
- **`META_WA_USE_TEMPLATES`**: Set to `true` in production to bypass WhatsApp's 24-hour session window.
- **`META_WA_TMPL_PRESCRIPTION`**: Name of the pre-approved template registered in Business Manager (e.g. `prescription_ready`).

---

## Cloudflare R2 Setup Guide

Cloudflare R2 is an S3-compatible object storage service that features a generous free tier (10 GB/month) and zero egress bandwidth fees.

### Step 1: Create an R2 Bucket
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Click **R2** in the left sidebar.
3. Click **Create bucket**.
4. Set the **Bucket name** (e.g., `hospital-prescriptions`).
5. Choose **Default** placement and click **Create bucket**.

### Step 2: Enable Public Access
To download the generated PDF files, the files must be publicly accessible.
1. Click on your newly created bucket.
2. Select the **Settings** tab.
3. Scroll down to the **Public Access** section.
4. Choose either:
   - **Connect Domain**: Enter a custom subdomain (e.g., `cdn.yourclinic.com`) if you have a domain managed by Cloudflare.
   - **R2.dev Subdomain**: Click **Allow Access** to get a free random subdomain (e.g., `https://pub-abcdef123.r2.dev`).
5. Copy the domain URL. This maps to your **`S3_PUBLIC_URL`**.

### Step 3: Generate R2 API Credentials
1. Go back to the main **R2** overview page in the sidebar.
2. In the right panel, click **Manage R2 API Tokens**.
3. Click **Create API token**.
4. Set a name (e.g., `Prescription Assistant Worker`).
5. Under **Permissions**, select **Admin Read & Write** (or choose custom permissions and scope it only to your `hospital-prescriptions` bucket).
6. Click **Create API Token**.
7. Copy the credentials immediately (they will not be shown again):
   - **Access Key ID** → Maps to `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → Maps to `S3_SECRET_ACCESS_KEY`
   - **Jurisdiction-specific Endpoint for S3 Clients** (e.g. `https://<account-id>.r2.cloudflarestorage.com`) → Maps to `S3_ENDPOINT`

### Step 4: Configure CORS Policy
To allow the browser frontend to load or print PDFs directly, configure the CORS rules:
1. In your bucket settings tab, scroll to **CORS Policy**.
2. Click **Add CORS Policy**.
3. Paste the following JSON configuration and save:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": []
     }
   ]
   ```

### Step 5: Update the `.env` File
Update your root `.env` file with the values:
```env
S3_ACCESS_KEY_ID=your_copied_access_key_id
S3_SECRET_ACCESS_KEY=your_copied_secret_access_key
S3_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
S3_BUCKET_NAME=hospital-prescriptions
S3_REGION=auto
S3_PUBLIC_URL=https://your_subdomain.r2.dev
```


