FROM node:20-slim

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG INSECURE_SSL=0
ENV NODE_TLS_REJECT_UNAUTHORIZED=${INSECURE_SSL:+0}
RUN if [ "$INSECURE_SSL" = "1" ]; then \
      npm config set strict-ssl false ; \
    fi

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

CMD ["npm", "run", "start:dev"]
