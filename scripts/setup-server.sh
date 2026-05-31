#!/usr/bin/env bash
# ── setup-server.sh ───────────────────────────────────────────────────────────
# Run ONCE on a fresh Hetzner CX22 (Ubuntu 22.04) to prepare it for deployment.
#
# Usage (from your local machine):
#   chmod +x scripts/setup-server.sh
#   ssh root@<SERVER_IP> "bash -s" < scripts/setup-server.sh
#
# After this script completes, log out and continue with deploy.sh.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "▶ Updating system packages..."
apt-get update -y && apt-get upgrade -y

echo "▶ Installing essentials..."
apt-get install -y --no-install-recommends \
  curl git ufw fail2ban unattended-upgrades

# ── Docker ───────────────────────────────────────────────────────────────────
echo "▶ Installing Docker..."
curl -fsSL https://get.docker.com | sh

# ── Non-root deploy user ──────────────────────────────────────────────────────
echo "▶ Creating deploy user..."
if ! id "deploy" &>/dev/null; then
  useradd -m -s /bin/bash -G docker deploy
fi

# Copy root's authorized_keys so the deploy user can be SSHed into.
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# ── Firewall ─────────────────────────────────────────────────────────────────
echo "▶ Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# ── Automatic security updates ───────────────────────────────────────────────
echo "▶ Enabling unattended security upgrades..."
dpkg-reconfigure --priority=low unattended-upgrades

# ── App directory ────────────────────────────────────────────────────────────
echo "▶ Creating /srv/hq..."
mkdir -p /srv/hq
chown deploy:deploy /srv/hq

echo ""
echo "✅ Server setup complete."
echo ""
echo "Next steps:"
echo "  1. Point your domain A record to this server's IP: $(curl -s ifconfig.me)"
echo "  2. SSH in as deploy: ssh deploy@$(curl -s ifconfig.me)"
echo "  3. Clone your repo:  git clone <YOUR_REPO_URL> /srv/hq"
echo "  4. Create .env:      cp /srv/hq/.env.prod.example /srv/hq/.env  && nano /srv/hq/.env"
echo "  5. Deploy:           cd /srv/hq && docker compose -f docker-compose.prod.yml up -d --build"
