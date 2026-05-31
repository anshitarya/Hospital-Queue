# Debian-slim base — ships with OpenSSL, so Prisma can detect the right
# query-engine variant (linux-arm64-openssl-3.0.x on Apple Silicon).
FROM node:20-slim

# OpenSSL is needed by Prisma's runtime engine. ca-certificates lets us
# download the engine binaries over HTTPS.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Optional local-dev escape hatch for networks that MITM-intercept HTTPS
# (e.g. corporate proxies). Build with:
#   docker-compose build --build-arg INSECURE_SSL=1
# This is intentionally OFF by default and must NOT be used in production.
ARG INSECURE_SSL=0
ENV NODE_TLS_REJECT_UNAUTHORIZED=${INSECURE_SSL:+0}
RUN if [ "$INSECURE_SSL" = "1" ]; then \
      npm config set strict-ssl false ; \
    fi

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy prisma schema first so generate works regardless of source bind mounts.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src

EXPOSE 4000

# On boot: sync schema, seed (idempotent), then start in watch mode.
# `db push` is intentionally used instead of `migrate deploy` — this MVP doesn't
# ship migration files. Before production, generate a baseline migration with
# `prisma migrate dev --name init` and switch this back to `migrate deploy`.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npx prisma db seed && npm run start:dev"]
