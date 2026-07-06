export default () => ({
  port: Number(process.env.API_PORT ?? 4000),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
    devMode: (process.env.OTP_DEV_MODE ?? 'true') === 'true',
  },
  queue: {
    defaultAvgConsultMinutes: Number(process.env.DEFAULT_AVG_CONSULT_MINUTES ?? 7),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    // For WhatsApp sandbox testing use 'whatsapp:+14155238886'.
    // For production use your approved WhatsApp Business number.
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    // Your Twilio SMS sender number in E.164 format, e.g. '+14155552671'.
    smsFrom: process.env.TWILIO_SMS_FROM ?? '',
  },
});
