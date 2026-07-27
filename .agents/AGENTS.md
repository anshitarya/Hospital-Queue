# Workspace Notes & Constraints

## Razorpay Integration Status

The Razorpay billing and subscription integration is fully implemented and compiled successfully:
- **Prisma Schema**: Synchronized with `Subscription` and updated `Payment` models.
- **Backend API**: Endpoints ready at `POST /api/billing/subscriptions/create-order`, `POST /api/billing/subscriptions/verify`, and the webhook handler `POST /api/billing/webhook`.
- **Frontend Panel**: The new `BillingTab` is integrated inside the reception dashboard and `/clinic-admin/billing` routing is set up.

## Pending Onboarding Actions

To activate Razorpay payments, the following settings need to be configured:
1. **API Keys**: Generate API keys on the Razorpay Dashboard, then add them to the root `.env`:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID`
2. **Webhook Endpoint**: Register a webhook targeting `https://<your-domain>/api/billing/webhook` (or ngrok endpoint in dev) and configure the secret in `.env` under `RAZORPAY_WEBHOOK_SECRET`.
3. **Webhook Subscribed Events**:
   - `order.paid`
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`

## Git Commit Guidelines

- **Do NOT run `git commit` automatically**. Leave all code changes uncommitted in the working directory for the user to review and commit themselves.
