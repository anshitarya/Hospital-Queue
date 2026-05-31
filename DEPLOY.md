# Deploying to Hetzner CX22

Total time: ~30–45 minutes for first deploy, ~2 minutes for every subsequent deploy.

---

## What you need before starting

- A Hetzner account → https://console.hetzner.cloud
- A domain name (even a free one like `queue.yourname.is-a.dev` works)
- Your SSH public key (`~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`)
- This repo pushed to GitHub (required so the server can `git pull`)

---

## Step 1 — Create the server on Hetzner

1. Go to https://console.hetzner.cloud → New Project → Add Server
2. **Location**: choose nearest to your clinic (Bangalore → Singapore or Mumbai)
3. **Image**: Ubuntu 22.04
4. **Type**: CX22 (2 vCPU, 4 GB RAM — ~€4.49/month)
5. **SSH Keys**: paste your public key (`cat ~/.ssh/id_ed25519.pub`)
6. **Name**: `hospital-queue` (or anything)
7. Click **Create & Buy**

Note the server IP (e.g. `5.75.123.45`).

---

## Step 2 — Point your domain to the server

In your domain registrar's DNS panel, create an **A record**:

```
Type: A
Name: queue          (or @ for root domain)
Value: 5.75.123.45   (your server IP)
TTL: 300
```

Full domain will be e.g. `queue.yourclinic.com`.

> DNS propagation takes 1–10 minutes. Let's Encrypt won't issue a cert until
> DNS resolves, so do this before step 5.

---

## Step 3 — One-time server setup

From your local machine:

```bash
ssh root@5.75.123.45 "bash -s" < scripts/setup-server.sh
```

This installs Docker, creates a `deploy` user, and configures the firewall.
Takes ~2 minutes. You only ever run this once.

---

## Step 4 — Push your code to GitHub

```bash
cd "Hospital Queue"
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_USERNAME/hospital-queue.git
git push -u origin main
```

---

## Step 5 — Clone repo and configure .env on server

```bash
# SSH as the deploy user
ssh deploy@5.75.123.45

# Clone
git clone git@github.com:YOUR_USERNAME/hospital-queue.git /srv/hq
cd /srv/hq

# Create production .env from example
cp .env.prod.example .env
nano .env
```

Fill in these values in `.env`:

| Variable | What to set |
|----------|-------------|
| `DOMAIN` | `queue.yourclinic.com` |
| `POSTGRES_PASSWORD` | Any strong password, e.g. output of `openssl rand -hex 16` |
| `JWT_SECRET` | Output of `openssl rand -hex 64` |
| `CORS_ORIGIN` | `https://queue.yourclinic.com` |
| `OTP_DEV_MODE` | `false` (patients won't see OTPs in plain text) |

Save and exit (`Ctrl+X → Y → Enter` in nano).

---

## Step 6 — First deploy

Still on the server:

```bash
cd /srv/hq
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes ~5–8 minutes (compiling TypeScript, building Next.js).
Watch progress:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

When you see:
```
api-1  | Hospital Queue API listening on :4000
web-1  | Listening on port 3000
```

open `https://queue.yourclinic.com` — it should load with a valid HTTPS cert.

---

## Step 7 — Every future deploy

From your **local machine**, after pushing changes to GitHub:

```bash
./scripts/deploy.sh deploy@5.75.123.45
```

This SSHes in, pulls latest code, rebuilds only changed containers, and waits
for the API health check. Takes ~2 minutes.

---

## Step 8 — Set up daily backups (optional but recommended)

On the server:

```bash
crontab -e
```

Add this line (runs backup every day at 2 AM):
```
0 2 * * * /srv/hq/scripts/backup-db.sh >> /srv/hq/backups/backup.log 2>&1
```

Backups land in `/srv/hq/backups/`. The script keeps the last 14 days automatically.

**Restore from backup:**
```bash
gunzip -c /srv/hq/backups/hq_20260524_020000.sql.gz \
  | docker compose -f /srv/hq/docker-compose.prod.yml exec -T postgres \
      psql -U hq hospital_queue
```

---

## Useful commands (run on server)

```bash
# View live logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# Restart a single service without rebuild
docker compose -f docker-compose.prod.yml restart api

# Open a Postgres shell
docker compose -f docker-compose.prod.yml exec postgres psql -U hq hospital_queue

# Check disk / memory usage
df -h && free -h

# Check running containers
docker compose -f docker-compose.prod.yml ps
```

---

## Production URLs

After deploy, these are live for your clinic:

| URL | Who uses it |
|-----|------------|
| `https://queue.yourclinic.com` | Landing page |
| `https://queue.yourclinic.com/login` | Staff login (email or phone) |
| `https://queue.yourclinic.com/register` | Receptionist self-registration |
| `https://queue.yourclinic.com/admin` | Admin dashboard (clinics + invite codes) |
| `https://queue.yourclinic.com/reception` | Receptionist dashboard |
| `https://queue.yourclinic.com/doctor` | Doctor dashboard |
| `https://queue.yourclinic.com/login/patient` | Patient OTP login |
| `https://queue.yourclinic.com/patient` | Patient live queue view |
| `https://queue.yourclinic.com/display/{doctorId}` | TV display board |

Seeded staff accounts (change passwords after first login):

| Email | Password | Role |
|-------|----------|------|
| `admin@clinic.local` | `password123` | Admin |
| `reception@clinic.local` | `password123` | Receptionist |
| `dr.sharma@clinic.local` | `password123` | Doctor |
| `dr.menon@clinic.local` | `password123` | Doctor |
| `dr.iyer@clinic.local` | `password123` | Doctor |

---

## Cost breakdown

| Item | Cost |
|------|------|
| Hetzner CX22 | ~€4.49/month |
| Domain (e.g. Namecheap) | ~₹800/year (~€9/year) |
| TLS certificate (Let's Encrypt via Caddy) | **Free** |
| **Total** | ~**€5/month** |

---

## What to do before a real clinic uses this

- [ ] Change all seeded passwords (`admin@clinic.local` etc.)
- [ ] Set `OTP_DEV_MODE=false` in `.env` and wire a real SMS provider (Twilio/MSG91)
- [ ] Take a manual backup before the first day of use: `./scripts/backup-db.sh`
- [ ] Share the correct role-specific URLs with staff
- [ ] Test the full patient flow: OTP → token → live ETA → consultation complete
- [ ] Bookmark `/display/{doctorId}` for the waiting room TV

---

## Troubleshooting

**Caddy shows "site not available"** → DNS hasn't propagated yet. Wait 5 min,
check with `dig queue.yourclinic.com`.

**API container keeps restarting** → `docker compose -f docker-compose.prod.yml logs api`
— usually a missing/wrong env var.

**`OTP_DEV_MODE=false` but patients don't receive SMS** → OTPs are still
generated; they just aren't sent because no SMS provider is wired. Set
`OTP_DEV_MODE=true` temporarily while testing.

**Build fails with "self-signed certificate" on the server** → The server is
behind a corporate proxy. This shouldn't happen on Hetzner but if it does, add
`INSECURE_SSL=1` to `.env` and add `args: { INSECURE_SSL: "${INSECURE_SSL:-0}" }`
to both services in `docker-compose.prod.yml`.
