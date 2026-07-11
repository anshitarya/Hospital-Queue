import { FEATURES } from '../common/features';

export default () => ({
  port: Number(process.env.API_PORT ?? 4000),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
    devMode: FEATURES.OTP_DEV_MODE,  // source of truth: features.ts
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
  /** Set SOCKET_IO_REDIS_ADAPTER=true only when running 2+ API machines (multi-instance). */
  socketio: {
    redisAdapter: process.env.SOCKET_IO_REDIS_ADAPTER === 'true',
  },
  msg91: {
    authKey:     process.env.MSG91_AUTH_KEY,
    senderId:    process.env.MSG91_SENDER_ID ?? 'TURNOS',
    dltEntityId: process.env.MSG91_DLT_ENTITY_ID,
  },
  metaWa: {
    accessToken:   process.env.META_WA_ACCESS_TOKEN,
    phoneNumberId: process.env.META_WA_PHONE_NUMBER_ID,
    useTemplates:  String(FEATURES.WHATSAPP_USE_TEMPLATES),  // source of truth: features.ts
    tmplQueueJoined:   process.env.META_WA_TMPL_QUEUE_JOINED,
    tmplTurnSoon:      process.env.META_WA_TMPL_TURN_SOON,
    tmplAlmostNext:    process.env.META_WA_TMPL_ALMOST_NEXT,
    tmplTurnNow:       process.env.META_WA_TMPL_TURN_NOW,
    tmplDoctorDelayed: process.env.META_WA_TMPL_DOCTOR_DELAYED,
    tmplQueueCleared:  process.env.META_WA_TMPL_QUEUE_CLEARED,
  },
});
