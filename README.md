# Hospital Queue

A queue management system for clinics and small hospitals. Patients see exactly
where they are in line and roughly when their turn comes, so they don't sit in
the waiting room for hours.

This repository is the **lean MVP** — small enough to read end-to-end, complete
enough to run a real clinic for a day. It deliberately leaves out Kafka, real
SMS, push notifications, and Kubernetes manifests; the seams for each of those
are present so they can be added incrementally.

---

## Quickstart

Prereqs: Docker + Docker Compose v2.

```bash
cp .env.example .env
docker-compose up --build
```

The first boot takes ~1–2 minutes (npm install, Prisma migrate, seed). When it's
ready you'll see:

- **Web app** → http://localhost:3000
- **API**     → http://localhost:4000/api
- **Postgres** → localhost:5432 (user/pass from `.env`)
- **Redis**   → localhost:6379

### Seeded accounts

| Role          | Email                       | Password      |
|---------------|-----------------------------|---------------|
| Admin         | `admin@clinic.local`        | `password123` |
| Receptionist  | `reception@clinic.local`    | `password123` |
| Doctor        | `dr.sharma@clinic.local`    | `password123` |
| Doctor        | `dr.menon@clinic.local`     | `password123` |
| Doctor        | `dr.iyer@clinic.local`      | `password123` |

Patients sign in via phone OTP. **In dev mode the OTP is printed to the API
container's stdout** (and to the patient login screen) — see
`docker-compose logs api`.

### Demo flow

1. Open http://localhost:3000 in two browser windows.
2. Window A: **Staff login** → reception → add a patient (any name + phone).
3. Window B: **Patient login** → enter that same phone → use the OTP that the
   reception flow caused to be logged in the API container, or that the patient
   login screen displays. (Re-enter the OTP step if needed: `/auth/otp/request`
   then `/auth/otp/verify` automatically log it.)
4. Window B now shows their live token, position, and ETA.
5. Back in window A, click **Call next** → window B updates in real time.

For a TV display board, open `/display/{doctorId}` (no login required) on a
clinic-room screen. Doctor IDs are visible in the doctor switcher of the
reception dashboard.

---

## Architecture

```
┌────────────────┐   HTTP + WS    ┌─────────────────────────────┐
│ Next.js 14     │ ◄────────────► │ NestJS API (Node 20)        │
│ (App Router)   │                │  - Auth (JWT, OTP)          │
│  /patient      │                │  - Doctors / Departments    │
│  /reception    │                │  - Queue + ETA + Gateway    │
│  /doctor       │                │  - Notifications (pluggable)│
│  /display/[id] │                └──────┬─────────────┬────────┘
└────────────────┘                       │             │
                                         │             │
                                ┌────────▼─────┐ ┌─────▼──────┐
                                │ PostgreSQL   │ │ Redis      │
                                │ (Prisma ORM) │ │ (OTP, idem │
                                │              │ │  cache,    │
                                │              │ │  rate lim) │
                                └──────────────┘ └────────────┘
```

### Folder layout

```
.
├── apps/
│   ├── api/                     NestJS backend
│   │   ├── prisma/              schema.prisma + seed.ts
│   │   └── src/
│   │       ├── common/          prisma, redis, guards, decorators
│   │       ├── config/          ConfigModule loader
│   │       └── modules/
│   │           ├── auth/        JWT, OTP (stub), staff login
│   │           ├── departments/
│   │           ├── doctors/
│   │           ├── patients/
│   │           ├── queue/       queue service, ETA, Socket.IO gateway
│   │           └── notifications/   provider interface + console stub
│   └── web/                     Next.js frontend (App Router)
│       ├── app/
│       │   ├── login/           staff
│       │   ├── login/patient/   patient OTP
│       │   ├── reception/
│       │   ├── doctor/
│       │   ├── patient/
│       │   └── display/[doctorId]/   TV board
│       ├── components/
│       └── lib/                 api, socket, auth (zustand)
├── docker-compose.yml
└── .env.example
```

---

## API contract (summary)

All routes are prefixed with `/api`. JWT goes in the `Authorization: Bearer …`
header. Role requirements are noted per endpoint.

### Auth
- `POST /auth/staff/login` `{ email, password }` → `{ token, user }`
- `POST /auth/otp/request` `{ phone }` → `{ devCode? }` (devCode only in dev)
- `POST /auth/otp/verify` `{ phone, code, name? }` → `{ token, user }`
- `GET  /auth/me` (any role) → current user

### Departments / Doctors
- `GET  /departments` (public) — includes doctors with status
- `POST /departments` (admin)
- `GET  /doctors?departmentId=…` (public)
- `GET  /doctors/:id` (public)
- `PATCH /doctors/:id` (doctor/reception/admin) — `{ status?, avgConsultMinutes?, delayMinutes? }`

### Patients
- `GET  /patients/search?phone=…` (staff)
- `POST /patients` (staff) — idempotent upsert by phone
- `GET  /patients/:id/history` (self or staff)

### Queue
- `GET  /queue/snapshot/:doctorId` (public) — entries + ETA + current token
- `GET  /queue/entry/:id` (auth) — patient view of a single entry
- `POST /queue/reception/join` (reception/admin) — supports `idempotencyKey`
- `POST /queue/patient/join` (patient)
- `POST /queue/doctor/:doctorId/call-next` (doctor/reception/admin)
- `POST /queue/entry/:id/complete` (doctor/reception/admin)
- `POST /queue/entry/:id/skip` (doctor/reception/admin)
- `POST /queue/entry/:id/cancel` (any auth — patient can cancel own)
- `POST /queue/entry/:id/reorder` (reception/admin) — `{ priority }` (100 = emergency)
- `POST /queue/doctor/:doctorId/pause` / `…/resume` (doctor/reception/admin)

### Realtime (Socket.IO)
Connect to the API host. Optional JWT in `auth.token` (anonymous OK for the
public display board).

- Client emits `subscribe:doctor` `{ doctorId }` — joins room, server replies
  with the initial snapshot in the ack callback.
- Server emits `queue:updated` to room `doctor:{id}` on every state change.
  Payload includes the full new snapshot, so clients do not need to re-fetch.
- Client emits `unsubscribe:doctor` `{ doctorId }` on cleanup.

---

## Queue logic & ETA

The ETA model is intentionally simple for V1 — easy to reason about, easy to
swap out later.

```
etaMinutes(entry) =
    remainingForCurrentInConsultation
  + peopleAhead * doctor.avgConsultMinutes
  + doctor.delayMinutes
```

- `peopleAhead` orders waiting entries by `(priority DESC, joinedAt ASC)`.
  Emergency (`priority=100`) and VIP (`priority=50`) entries jump ahead.
- `remainingForCurrentInConsultation = max(0, avgConsultMinutes - elapsed since startedAt)`.
- `delayMinutes` is a doctor-level offset; reception sets it when the doctor
  is running late, and patients see the bumped ETA immediately.

When a state change happens — new patient, call-next, complete, pause, reorder —
the server recomputes the snapshot once and broadcasts it to every connected
subscriber for that doctor. Clients render off the snapshot, which keeps the
UI consistent and lets us drop optimistic updates without flicker.

### Concurrency

- Token allocation uses a SERIALIZABLE Prisma transaction to keep
  `(doctorId, serviceDay, tokenNumber)` unique under concurrent joins.
- All state transitions go through a single `transition()` helper that checks
  the legal next state (e.g. you can't `complete` a `WAITING` entry) and
  increments a `version` field for clients that want optimistic locking.
- `version`, `joinedAt`, `calledAt`, `startedAt`, `completedAt` give a clean
  audit trail; a `QueueEvent` row is also written on every change.

### Idempotency

`POST /queue/reception/join` accepts an `idempotencyKey` (in the body or the
`Idempotency-Key` header). The first request with a given key creates the
entry; replays within 10 minutes return the same entry id. This guards against
double-clicks and network retries on the reception form.

---

## Configuration

Everything is in `.env`. The defaults work for local development; production
should at minimum:

- set a strong `JWT_SECRET`
- set `OTP_DEV_MODE=false` and register a real SMS provider (see below)
- set `CORS_ORIGIN` to your real frontend origin
- restrict the Postgres password and rotate the Redis URL if exposed

---

## Swapping in real providers

The notification module is provider-agnostic. To wire Twilio:

```ts
// apps/api/src/modules/notifications/twilio.provider.ts
import { Injectable } from '@nestjs/common';
import { NotificationProvider, NotificationChannel, OutboundMessage } from './notification.provider';

@Injectable()
export class TwilioSmsProvider implements NotificationProvider {
  readonly name = 'twilio';
  supports(c: NotificationChannel) { return c === 'SMS'; }
  async send(m: OutboundMessage) {
    // call Twilio REST API here
    return { id: '…', status: 'sent' as const };
  }
}
```

Then in `notifications.module.ts`, add `TwilioSmsProvider` to the providers
array **before** the console stub and include it in the `NOTIFICATION_PROVIDERS`
factory. The first provider that `supports(channel)` wins.

The same shape works for WhatsApp and push (FCM / APNS). The OTP flow goes
through `OtpService` which currently logs to stdout; pass a `NotificationsService`
into it to route the OTP through whatever provider is configured.

---

## What's deliberately *not* in V1

These are intentional cuts to keep the MVP shippable. Each has a clean swap-in
point — none of them require a rewrite.

| Excluded                       | When you'll want it          | Where it slots in |
|--------------------------------|------------------------------|-------------------|
| Kafka / event streaming        | Multi-service, analytics warehouse | Replace `QueueEvent` table writes with topic publish; gateway becomes a Kafka consumer |
| Real SMS / WhatsApp / Push     | Day one of any real clinic   | New `NotificationProvider` impl (see above) |
| Push notifications             | Patient mobile app           | Add a `PushProvider`; register device tokens on the User |
| Appointment booking (vs walk-in) | Multi-day scheduling        | New `Appointment` model that creates `QueueEntry` on the service day |
| Multi-tenant (many clinics)    | SaaS rollout                 | Add `tenantId` to User / Doctor / QueueEntry; scope all queries |
| Voice announcements            | Larger waiting halls         | Web Speech API on `/display/[id]` reading new tokens aloud |
| Analytics dashboard            | Operational tuning           | Read off `QueueEvent` — average wait, no-show rate, doctor utilisation |
| Production deploy (k8s/PaaS)   | Beyond one clinic            | Multi-stage Dockerfiles + a managed PG + managed Redis |
| Tests (unit + e2e)             | Before production            | Jest + Supertest for API; Playwright for web |

---

## Production checklist (when you're ready)

- [ ] Rotate `JWT_SECRET` and store via a secrets manager
- [ ] Move Postgres + Redis to managed services with backups
- [ ] Switch API Dockerfile to multi-stage (deps → build → slim runtime)
- [ ] Switch web Dockerfile to `next build && next start` (or static export)
- [ ] Add observability — structured logs already in place, add traces (OpenTelemetry) and metrics (Prom)
- [ ] Wire a real SMS provider; remove `OTP_DEV_MODE=true`
- [ ] HTTPS termination at a reverse proxy (Caddy/Nginx/managed LB)
- [ ] Set up CI: typecheck, lint, prisma validate, build, then deploy
- [ ] Backup + restore drill for Postgres
- [ ] Rate limit OTP at the gateway too (currently only at app layer)
- [ ] Add a `/health` endpoint and wire to compose / k8s probes

---

## Development

Run the API standalone (outside Docker):

```bash
cd apps/api
npm install
# Ensure DATABASE_URL points at a running postgres
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Run the web standalone:

```bash
cd apps/web
npm install
npm run dev
```

Helpful commands:

- `npx prisma studio --schema apps/api/prisma/schema.prisma` — DB browser
- `docker-compose logs -f api`                                — API logs (OTPs appear here in dev)
- `docker-compose exec postgres psql -U hq hospital_queue`    — direct DB shell
- `docker-compose exec redis redis-cli`                       — Redis shell

---

## License

MIT (or whatever the clinic chooses) — this is an MVP, not a product yet.
