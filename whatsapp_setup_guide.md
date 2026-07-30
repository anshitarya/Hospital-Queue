# Meta WhatsApp Cloud API Setup Guide

This guide describes how to configure the direct Meta WhatsApp Cloud API to send prescription download links directly to your patients' mobile phone numbers.

---

## 💡 How the 1,000 Free Chats/Month Works
Meta provides **1,000 free "Service" (User-Initiated) conversations per month** for every WhatsApp Business Account.
- **User-Initiated**: If a patient messages your WhatsApp number first (e.g. asking for status) and you reply, it is free.
- **Business-Initiated**: When the clinic sends the prescription download link *first* (which is a business-initiated template message), Meta charges a direct conversation fee (e.g. **~₹0.30 - ₹0.72 in India** per 24-hour chat window). There is no monthly fee; you only pay for what you use.

---

## 🛠️ Step-by-Step Setup

### Step 1: Create a Meta Developer App
1. Go to the [Meta for Developers Portal](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** in the top menu, then click **Create App**.
3. Select **Other** -> Click **Next**.
4. Choose **Business** as the app type -> Click **Next**.
5. Set your app name (e.g., `Turnos Notification Service`), select your Business Portfolio, and click **Create app**.

### Step 2: Add WhatsApp to the App
1. In your app dashboard, scroll down to find **WhatsApp** and click **Set up**.
2. Select your Business Portfolio (or create one) and click **Continue**.
3. You will be redirected to the WhatsApp Getting Started page. Under **Step 1: Select phone numbers**, you will find:
   - **Temporary Access Token** (expires in 24 hours).
   - **Phone Number ID** (e.g., `10928373738...`). Copy this value!

---

### Step 3: Generate a Permanent System User Token
Since temporary tokens expire in 24 hours, you need a permanent token for production:
1. Go to the [Meta Business Settings Portal](https://business.facebook.com/settings).
2. Select your Business Account.
3. In the left sidebar, go to **Users** -> **System Users**.
4. Click **Add** -> Name the user `turnos-system-user` and select the **Admin** role.
5. Once created, click **Assign Assets**:
   - Select **Apps** -> Choose your `Turnos Notification Service` app.
   - Enable **Full Control (Manage App)** and click **Save Changes**.
6. Click **Generate New Token**:
   - Select your app.
   - Check the following two permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - Click **Generate Token**.
7. **Copy this token immediately** and save it somewhere secure. This token will never expire.

---

### Step 4: Register your Clinic Phone Number
To send from your actual clinic number instead of Meta's test number:
1. Under **WhatsApp** -> **Setup** in the developer dashboard, click **Add Phone Number**.
2. Enter your display name, category, and phone number.
   > [!WARNING]
   > The phone number you use must **not** be registered on a regular WhatsApp or WhatsApp Business mobile app. If it is, you must delete that account in your mobile app settings before adding it here.
3. Verify the number via SMS OTP.

---

### Step 5: Create a Message Template (Required by Meta)
To send messages *first* to patients, Meta requires you to use an approved message template:
1. In the WhatsApp dashboard, click **Template Manager** (or go to [WhatsApp Manager -> Message Templates](https://business.facebook.com/wa/manage/templates)).
2. Click **Create Template**:
   - **Category**: Utility
   - **Name**: `prescription_ready`
   - **Language**: English (en)
3. Set the message body:
   ```text
   Hello {{1}}, your prescription from Dr. {{2}} is ready. You can view or download it here: {{3}}
   ```
4. Click **Submit** for approval. (Meta usually approves template requests automatically within 2 to 5 minutes).

---

### Step 6: Update the Root `.env`
Open your root `.env` file and update your variables:

```env
# Enable direct Meta WhatsApp API integration
META_WA_ACCESS_TOKEN=your_permanent_system_user_token
META_WA_PHONE_NUMBER_ID=your_registered_phone_number_id

# Template configuration
META_WA_USE_TEMPLATES=true
META_WA_TMPL_PRESCRIPTION=prescription_ready
```

---

## 🧪 Testing your Setup
1. Boot the dev stack: `./scripts/dev.sh`
2. Start a consultation for a patient who has a valid mobile phone number.
3. Stop recording, edit details, and click **Save & Send via WhatsApp**.
4. Your background worker will format the template variables and trigger the Meta endpoint. The patient will receive a real WhatsApp message on their phone instantly!
