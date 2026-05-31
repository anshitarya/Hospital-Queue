FROM node:20-slim

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Same escape hatch as the api image. See apps/api/Dockerfile for details.
ARG INSECURE_SSL=0
ENV NODE_TLS_REJECT_UNAUTHORIZED=${INSECURE_SSL:+0}
RUN if [ "$INSECURE_SSL" = "1" ]; then \
      npm config set strict-ssl false ; \
    fi

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json next.config.mjs tailwind.config.ts postcss.config.js ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public

EXPOSE 3000

CMD ["npm", "run", "dev"]
