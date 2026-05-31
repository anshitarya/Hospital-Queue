# Deploying to DigitalOcean (Bangalore — BLR1)

Recommended hosting for **production** because the server sits in India, so
patient phones see ~20–40 ms RTT instead of ~150–200 ms (Hetzner's nearest
DC is in Europe). Everything else — Docker, Caddy, Postgres, Redis, Nest,
Next — is identical to the Hetzner deploy. You can reuse the same setup and
deploy scripts.

Total time: ~30–45 minutes for first deploy, ~2 minutes for every subsequent
deploy.

---

## TL;DR

```bash
# 1. Create $6 Basic Droplet in BLR1 (Ubuntu 22.04, your SSH key)
# 2. Point queue.yourclinic.com A record → droplet IP
# 3. From your laptop:
ssh root@<DROPLET_IP> "bash -s" < scripts/setup-server.sh
ssh deploy@<DROPLET_IP>
git clone <YOUR_REPO_URL> /srv/hq && cd /srv/hq
cp .env.prod.example .env && nano .env   # fill DOMAIN, JWT_SECRET, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
# 4. Open https://queue.yourclinic.com
```

---

## What you need before starting

- A DigitalOcean account → https://cloud.digitalocean.com
  (use a $200-credit referral link if you can find one — covers your first
   ~6 months for free)
- A domain name. Cheapest options:
    - `.in` on Namecheap or BigRock: ₹250–₹600/year
    - `.com` on Cloudflare Registrar: ~$10/year, at-cost (no markup)
- Your SSH public key (`~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`)
- This repo pushed to GitHub (the server will `git pull` from it)
- Optional but recommended: a **Cloudflare** account for DNS + free CDN +
  DDoS protection in front of the droplet

---

## Step 1 — Choose the droplet size

For the load you wrote in `DEPLOY.md` (5 clinics, 150 patients/day each)
the smallest tier works comfortably. Pick based on growth ambition:

| Plan | vCPU | RAM | SSD | Transfer | Monthly | Right for |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Basic Regular | 1 | 1 GB | 25 GB | 1 TB | **$6** | ≤ 20 clinics |
| Basic Regular | 1 | 2 GB | 50 GB | 2 TB | $12 | ≤ 50 clinics |
| Basic Premium AMD | 2 | 4 GB | 80 GB | 4 TB | $24 | ≤ 150 clinics |
| General Purpose | 2 | 8 GB | 25 GB | 4 TB | $63 | 150+ clinics |

You can resize **any** of these to a bigger plan in ~30 seconds from the DO
panel, with one reboot, no data loss. Start at $6.

---

## Step 2 — Create the droplet

1. Go to https://cloud.digitalocean.com → **Create** → **Droplets**
2. **Region**: **Bangalore 1 (BLR1)** — India-local, lowest latency
3. **OS**: Ubuntu 22.04 (LTS) x64
4. **Plan**: **Basic → Regular → $6/mo (1 GB / 1 vCPU)**
5. **CPU options**: Regular SSD is fine (Intel/AMD; Premium gives slightly
   newer silicon for +$1)
6. **Authentication**: SSH Key → **Add SSH Key** → paste
   `cat ~/.ssh/id_ed25519.pub` from your local machine
7. **Hostname**: `hospital-queue` (or anything memorable)
8. **Backups** (right sidebar): **enable** — adds 20% (~$1.20/mo) but gives
   you a 7-day rolling restore point. Worth every paisa.
9. **Click "Create Droplet"**.

Note the **public IPv4** that appears (e.g. `139.59.21.34`). You'll need it
in the next steps.

> Tip: DO also lets you allocate a **Reserved IP** (free as long as it's
> attached to a droplet). Useful so the IP doesn't change if you ever
> destroy + recreate the droplet. Networking → Reserved IPs → Assign to
> `hospital-queue`.

---

## Step 3 — Point your domain to the droplet

Two paths. Pick **3a** if you want simplicity, **3b** if you want Cloudflare's
free CDN + DDoS shield in front of your app (recommended for production).

### 3a. DNS at your registrar (simple)

In your registrar's DNS panel, create an **A record**:

```
Type:  A
Host:  queue           (or @ for the root domain)
Value: 139.59.21.34    (your droplet IP)
TTL:   300
```

Wait 2–10 minutes for propagation, verify with:
```bash
dig +short queue.yourclinic.com
```

### 3b. DNS via Cloudflare (recommended — free)

1. Sign up at https://dash.cloudflare.com → **Add a site** → enter
   `yourclinic.com` → free plan.
2. Cloudflare gives you two nameservers (e.g. `nora.ns.cloudflare.com`,
   `dane.ns.cloudflare.com`). Set these at your domain registrar in place
   of the registrar's default nameservers.
3. In the Cloudflare DNS panel → **Add record**:
   - Type: `A`
   - Name: `queue`
   - IPv4: your droplet IP
   - **Proxy status: DNS only** (grey cloud) initially — flip to "Proxied"
     (orange cloud) only **after** Step 6 succeeds, otherwise Let's Encrypt
     will fail to validate.
4. SSL/TLS → **Encryption mode: Full (strict)** once the proxy is on.

> Why bother with Cloudflare? You get free DDoS protection, free CDN for
> static assets, free analytics, free SSL termination, and one easy place
> to block abusive IPs. None of it costs money for an app this size.

---

## Step 4 — One-time server setup

The existing `scripts/setup-server.sh` is Ubuntu-22-generic — it works on a
DO droplet without any modification. From your **local** machine:

```bash
cd "Hospital Queue"
chmod +x scripts/setup-server.sh
ssh root@139.59.21.34 "bash -s" < scripts/setup-server.sh
```

What it does (~2 min):
- Updates apt packages.
- Installs Docker (official `get-docker.com` script).
- Creates a non-root `deploy` user, copies your SSH key over.
- Configures `ufw` firewall to allow SSH / 80 / 443 only.
- Enables `unattended-upgrades` so the OS auto-patches security issues.

When done you'll see:
```
✅ Server setup complete.
Next steps:
  1. Point your domain A record to this server's IP: 139.59.21.34
  ...
```

> Belt-and-suspenders option: DO has its own **Cloud Firewall** (network
> ACL, separate from the OS-level ufw). On the droplet's page → Networking →
> Firewalls → create one allowing inbound 22 / 80 / 443 only. Attach it to
> your droplet. Defence in depth.

---

## Step 5 — Push your code to GitHub

If you haven't yet:

```bash
cd "Hospital Queue"
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_USERNAME/hospital-queue.git
git push -u origin main
```

> The repo URL has to be **reachable from the droplet**. Public repo = no
> setup. Private repo = either add a deploy key in GitHub repo settings or
> use a Personal Access Token in the clone URL.

---

## Step 6 — Clone repo and configure `.env` on the droplet

```bash
# SSH as the non-root deploy user
ssh deploy@139.59.21.34

# Clone the repo
git clone https://github.com/YOUR_USERNAME/hospital-queue.git /srv/hq
cd /srv/hq

# Create production .env from example
cp .env.prod.example .env
nano .env
```

Fill these values in `.env`:

| Variable | What to set | How |
| --- | --- | --- |
| `DOMAIN` | `queue.yourclinic.com` | your actual subdomain |
| `POSTGRES_PASSWORD` | strong random password | `openssl rand -hex 16` on your laptop |
| `JWT_SECRET` | 64-char random hex | `openssl rand -hex 64` on your laptop |
| `CORS_ORIGIN` | `https://queue.yourclinic.com` | must include `https://` |
| `OTP_DEV_MODE` | `false` | flip to `true` only during initial smoke tests |
| `OTP_TTL_SECONDS` | `300` | leave default unless you have a reason |

Save and exit (`Ctrl+X → Y → Enter` in nano).

**Verify** nothing is missing:
```bash
grep -E "DOMAIN|JWT_SECRET|POSTGRES_PASSWORD|CORS_ORIGIN" .env
```

---

## Step 7 — Apply the deploy-script health-check fix

> The shipped `scripts/deploy.sh` waits on a stale health URL (`/api/auth/me`
> which is JWT-gated). The codebase now exposes `/api/health` — a public
> liveness probe. Update the script once on the server so future deploys
> succeed cleanly.

On the droplet:
```bash
sed -i 's|/api/auth/me|/api/health|g' /srv/hq/scripts/deploy.sh
```

Or edit it via `nano /srv/hq/scripts/deploy.sh` and change the curl URL
manually. Skip this if you've already updated `deploy.sh` locally and pushed.

---

## Step 8 — First deploy

Still on the droplet:

```bash
cd /srv/hq
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes ~5–8 minutes (TypeScript compile + Next.js bundle). Watch
progress:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

You'll see, in order:
```
postgres-1  | database system is ready to accept connections
redis-1     | Ready to accept connections
api-1       | [Nest] LOG [NestApplication] Nest application successfully started
api-1       | Hospital Queue API listening on :4000
web-1       | ▲ Next.js 14.x.x
web-1       | - Local:        http://localhost:3000
caddy-1     | certificate obtained successfully
```

Caddy needs **DNS to be resolving** before it can get a Let's Encrypt cert.
If you see `certificate obtain failed`, check `dig queue.yourclinic.com`
returns the right IP and try again.

Now open `https://queue.yourclinic.com` in a browser — valid HTTPS cert,
landing page loads. **You're live.**

---

## Step 9 — Smoke-test the deploy

A 5-minute checklist before letting any real user touch it:

1. **Admin login** at `https://queue.yourclinic.com/login` with the seeded
   `admin@clinic.local` / `password123`. Change the password from the profile
   page immediately.
2. **Health endpoints**:
   ```bash
   curl -s https://queue.yourclinic.com/api/health
   # → {"ok":true,"uptime":...,"timestamp":"..."}
   curl -s https://queue.yourclinic.com/api/ready
   # → {"ok":true,"postgres":"ok","redis":"ok"}
   ```
3. **Patient OTP** at `https://queue.yourclinic.com/login/patient` — type
   a 10-digit number, click Send OTP. Because `OTP_DEV_MODE=false` is set,
   the code goes to your SMS provider (if you've wired one) or is silently
   dropped. **Temporarily flip `OTP_DEV_MODE=true`** while testing — the code
   appears in `docker compose logs api`. Restore to `false` before going
   live.
4. **WebSocket** — log in as a doctor in one browser tab, reception in
   another. Add a patient from reception; the doctor tab should see the
   new token appear within 1 second without refresh.

---

## Step 10 — Every future deploy

From your **local machine**, after pushing changes to GitHub:

```bash
./scripts/deploy.sh deploy@139.59.21.34
```

This:
1. SSHes into the droplet.
2. `git pull --ff-only` on `/srv/hq`.
3. `docker compose up -d --build --remove-orphans` (rebuilds only changed
   layers — usually ~30 sec).
4. Polls `/api/health` until the API is responding.
5. Prunes dangling images.

Total time: ~2 minutes. Zero manual SSH for routine deploys.

---

## Step 11 — Automated daily backups

DO offers two backup mechanisms — use **both** for healthcare data.

### 11a. DO Backups (full-VM snapshot)

You enabled this in Step 2 (the "+20%" checkbox). DO takes a full droplet
snapshot every ~24 hours and keeps the last 7. Restore = click "Restore"
on the Backups tab → ~5 minute downtime.

Trade-off: cheap, easy, but the restore granularity is the whole VM, not a
single table or a single point in time.

### 11b. Postgres-only logical backups (recommended in addition)

The repo ships a `scripts/backup-db.sh` that takes a `pg_dump`, gzips it,
and rotates after 14 days. Run it on cron:

```bash
ssh deploy@139.59.21.34
crontab -e
```

Add this line (runs every day at 2 AM IST):
```
0 2 * * * /srv/hq/scripts/backup-db.sh >> /srv/hq/backups/backup.log 2>&1
```

Backups land in `/srv/hq/backups/hq_YYYYMMDD_HHMMSS.sql.gz`. **Test the
restore path before you trust the backups**:

```bash
# Restore from a specific backup
gunzip -c /srv/hq/backups/hq_20260601_020000.sql.gz \
  | docker compose -f /srv/hq/docker-compose.prod.yml exec -T postgres \
      psql -U hq hospital_queue
```

### 11c. Off-site copy (optional but strongly recommended)

DO Backups live in DO. If your account is locked, you lose access to them.
Mirror the daily `pg_dump` to **DigitalOcean Spaces** (S3-compatible,
$5/month for 250 GB) or **Backblaze B2** (~$0.10/month for 20 GB).

Quick setup with `rclone`:
```bash
sudo apt install -y rclone
rclone config   # set up "do_spaces" remote
# Then append to crontab:
30 2 * * * rclone copy /srv/hq/backups do_spaces:hq-backups --max-age 24h
```

Now you have three copies of the data: live DB, on-host gzip, off-site
mirror. That's the floor for anything healthcare-adjacent.

---

## Step 12 — Wire a real SMS provider

`OTP_DEV_MODE=false` means OTPs are *generated* but not *sent* — they just
disappear unless you've wired a provider. For India, **MSG91** is the
cheapest DLT-compliant option. Cost: ~₹0.15 per SMS.

1. Sign up at https://msg91.com → verify your phone.
2. Apply for **DLT registration** (3–5 business days; mandatory for India).
   Submit your sender ID (e.g. `HQUEUE`) and a transactional template:
   ```
   Your Hospital Queue OTP is {#var#}. Valid 5 minutes. Do not share.
   ```
3. Once approved, grab the API key + sender ID and add to `.env`:
   ```
   SMS_PROVIDER=msg91
   MSG91_AUTH_KEY=<your-key>
   MSG91_SENDER=HQUEUE
   MSG91_TEMPLATE_ID=<template-id>
   ```
4. Replace the `this.logger.warn(...)` line in
   `apps/api/src/modules/auth/otp.service.ts` with an HTTP call to MSG91's
   send-flow endpoint. Roughly 30 lines.
5. Redeploy.

---

## Cost breakdown — running on DO

For 5 clinics × 150 patients/day each (your stated launch scale):

| Item | Cost (USD/month) |
| --- | ---: |
| Droplet — Basic 1 GB / 1 vCPU, BLR1 | **$6.00** |
| DO Backups (auto VM snapshots) | $1.20 |
| Reserved IPv4 (attached to droplet) | $0.00 |
| Domain (`.in` or `.com` amortised over a year) | ~$1.00 |
| MSG91 SMS, ~250 sends/day @ ₹0.15 | ~$15.00 |
| Email (transactional) — SendGrid free tier | $0.00 |
| UptimeRobot (free monitoring, 5-min checks) | $0.00 |
| Cloudflare (free tier — DNS + CDN + DDoS) | $0.00 |
| **Total** | **~$23 / month** |

Per clinic that's **~$4.60/clinic/month**. Per patient visit: **~$0.001**.

---

## Production URLs

After deploy, these are live for your clinic:

| URL | Who uses it |
| --- | --- |
| `https://queue.yourclinic.com` | Landing page |
| `https://queue.yourclinic.com/login/choose` | Role-choice portal |
| `https://queue.yourclinic.com/login` | Staff sign-in (email or phone) |
| `https://queue.yourclinic.com/register` | Receptionist self-registration |
| `https://queue.yourclinic.com/admin` | Admin dashboard |
| `https://queue.yourclinic.com/reception` | Receptionist dashboard |
| `https://queue.yourclinic.com/doctor` | Doctor dashboard |
| `https://queue.yourclinic.com/login/patient` | Patient OTP login |
| `https://queue.yourclinic.com/patient` | Patient live queue view |
| `https://queue.yourclinic.com/display/{doctorId}` | Waiting-room TV display |
| `https://queue.yourclinic.com/api/health` | Liveness (Caddy + UptimeRobot use this) |
| `https://queue.yourclinic.com/api/ready` | Readiness (DB + Redis ping) |

Seeded staff accounts (change passwords immediately):

| Email | Password | Role |
| --- | --- | --- |
| `admin@clinic.local` | `password123` | Admin |
| `reception@clinic.local` | `password123` | Receptionist |
| `dr.sharma@clinic.local` | `password123` | Doctor |
| `dr.menon@clinic.local` | `password123` | Doctor |
| `dr.iyer@clinic.local` | `password123` | Doctor |

---

## Useful day-2 commands

Run these on the droplet (`ssh deploy@<IP>`):

```bash
# View live logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# Tail just the last 100 lines + follow
docker compose -f docker-compose.prod.yml logs --tail=100 -f

# Restart a single service without rebuild (useful after .env edit)
docker compose -f docker-compose.prod.yml restart api

# Open a Postgres shell
docker compose -f docker-compose.prod.yml exec postgres psql -U hq hospital_queue

# Check resource usage
docker stats --no-stream
df -h && free -h

# Check running containers + their healthcheck status
docker compose -f docker-compose.prod.yml ps
```

---

## What to do before a real clinic uses this

- [ ] Change every seeded password (`admin@clinic.local`, every `dr.*`, `reception@clinic.local`)
- [ ] Set `OTP_DEV_MODE=false` and wire MSG91 (Step 12) — patients must
      receive real SMS
- [ ] Take a manual backup before day-1: `./scripts/backup-db.sh`
- [ ] Test the full patient flow on an actual phone with real cell signal:
      OTP → token → live ETA → consultation complete
- [ ] Test the `/display/{doctorId}` board on the actual waiting-room TV
- [ ] Set up UptimeRobot to ping `/api/health` every 5 min and email/SMS
      you on failure
- [ ] Document **your** clinic's correct URLs for the staff (cut-and-pasted
      from the table above with the real domain)
- [ ] Verify the cron backup ran by checking
      `/srv/hq/backups/backup.log`
- [ ] If using Cloudflare, flip DNS to "Proxied" (orange cloud) only AFTER
      HTTPS is fully working

---

## Scaling up

When you grow, follow this ladder. None of these require rewriting code —
they're all configuration changes.

| Trigger | Action | New monthly cost |
| --- | --- | --- |
| Past 20 clinics or seeing >50% CPU sustained | DO panel → Resize → **2 GB / 1 vCPU** droplet ($12), one reboot | ~$30 |
| Past 50 clinics | Resize → **4 GB / 2 vCPU AMD** ($24); enable **Premium** if not already | ~$50 |
| Postgres data crosses ~20 GB | Move to **DO Managed Postgres** ($15/mo), point `DATABASE_URL` at it | ~$70 |
| Past 150 clinics | **General Purpose 8 GB / 2 vCPU** ($63) + Managed PG + add a **Load Balancer** ($12) | ~$120 |
| Multi-region (e.g. Mumbai + Bangalore) | Two droplets in different DCs, Managed PG with read replica | ~$200+ |

All upgrades take <10 minutes and zero schema migration. The point is:
**you don't have to over-architect day one**. Start at $6, climb a rung
when the metrics tell you to.

---

## Troubleshooting

**Caddy log shows "obtaining certificate failed"**
DNS hasn't reached Let's Encrypt's resolvers yet. `dig +short queue.yourclinic.com`
should return your droplet IP. If using Cloudflare, the proxy must be DNS-only
(grey cloud) for the initial cert. Switch to "Proxied" (orange) only after
HTTPS works.

**API container keeps restarting**
```bash
docker compose -f docker-compose.prod.yml logs api --tail=50
```
Most common cause: missing env var. The container fails fast if `JWT_SECRET`
or `DATABASE_URL` is unset.

**Out of memory at low load**
You're probably running the dev build. The production stack uses
`docker-compose.prod.yml` (note: not `docker-compose.yml`). Each container
peaks at ~300 MB RSS in production mode — total ~1 GB on the 1 GB plan,
which is right at the edge. Bump to the 2 GB plan ($12) if you see swapping
in `free -h`.

**OTP SMS never arrives**
1. Confirm `OTP_DEV_MODE=false` in `.env`, then `docker compose restart api`.
2. Check `docker compose logs api | grep -i otp` for the "Sent OTP" log line.
3. If you haven't wired MSG91 yet (Step 12), OTPs are silently dropped —
   patients can't log in. Temporarily set `OTP_DEV_MODE=true` until Step 12
   is done.

**Docker build fails on the droplet with "self-signed certificate in certificate chain"**
You're on a network behind a TLS-intercepting proxy. Shouldn't happen on
DO. If it does, add `INSECURE_SSL=1` to `.env` (this flag is already
plumbed in the Dockerfiles).

**`docker compose ps` shows a service as "unhealthy"**
Look at the healthcheck output:
```bash
docker inspect --format='{{json .State.Health}}' hq-api-1 | jq
```
If the API's `/api/health` returns 200 but the container is unhealthy, the
service-level healthcheck in `docker-compose.prod.yml` may still be pointing
at the old `/api/auth/me` URL — fix the same way as Step 7:
```bash
sed -i 's|/api/auth/me|/api/health|g' docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d
```

**Disk filling up**
```bash
docker system prune -a --volumes
```
Reclaims unused images, build cache, and orphan volumes. Run safely
every few weeks.

---

## Differences from the Hetzner deploy

For reference, here's what's actually different between this and
`DEPLOY.md`:

| Concern | Hetzner | DigitalOcean |
| --- | --- | --- |
| Server type | CX22 (€4.51/mo, 2 vCPU / 4 GB) | Basic Droplet ($6, 1 vCPU / 1 GB) |
| Region | Helsinki / Falkenstein / US | **Bangalore** (BLR1) |
| Provisioning console | Hetzner Cloud Console | DigitalOcean dashboard |
| Backups | Hetzner Backups (+20%) | DO Backups (+20%) — identical model |
| Reserved IP | Free | Free when attached to droplet |
| Built-in network firewall | None (use ufw) | Cloud Firewalls (free, optional) |
| Latency to India | ~150–200 ms | ~20–40 ms |
| Setup script | `scripts/setup-server.sh` | **same script — no changes needed** |
| Deploy script | `scripts/deploy.sh` | **same script — same one-line fix in Step 7** |
| `docker-compose.prod.yml` | Used as-is | **Used as-is** |
| `.env.prod.example` | Used as-is | **Used as-is** |

The application stack is host-agnostic. Pick the host on **latency to your
users** and **operational comfort** — the price/specs are within a dollar.
