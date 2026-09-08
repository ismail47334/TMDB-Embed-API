# ---------- Build Stage ----------
FROM node:22-slim AS build
ARG VERSION=dev
WORKDIR /app

# Install build deps for puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libxss1 libasound2 libatk1.0-0 \
    libxshmfence1 libcups2 libxfixes3 libxext6 libx11-6 ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Install Chrome for Puppeteer
RUN npx puppeteer browsers install chrome

# Copy source code
COPY apiServer.js ./
COPY providers ./providers
COPY proxy ./proxy
COPY public ./public
COPY utils ./utils
COPY README.md ./

# ---------- Runtime Stage ----------
FROM node:22-slim AS runtime
ARG VERSION=dev
WORKDIR /app

# Environment variables
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    APP_VERSION=${VERSION} \
    PUPPETEER_CACHE_DIR=/home/app/.cache/puppeteer

# Install runtime deps for chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libxss1 libasound2 libatk1.0-0 \
    libxshmfence1 libcups2 libxfixes3 libxext6 libx11-6 ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r app && useradd -r -g app -m app && mkdir -p /home/app/.cache/puppeteer && chown -R app:app /home/app

# Copy built artifacts + chrome cache
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /root/.cache/puppeteer /home/app/.cache/puppeteer
COPY --from=build /app/apiServer.js ./
COPY --from=build /app/public ./public
COPY --from=build /app/providers ./providers
COPY --from=build /app/proxy ./proxy
COPY --from=build /app/utils ./utils
COPY --from=build /app/package.json ./
COPY --from=build /app/README.md ./

EXPOSE 8787

RUN chown -R app:app /app
USER app

LABEL org.opencontainers.image.title="TMDB Embed API" \
    org.opencontainers.image.description="Streaming metadata + source aggregation API" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.source="https://github.com/Inside4ndroid/TMDB-Embed-API" \
    org.opencontainers.image.licenses="MIT"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

CMD ["node","apiServer.js"]
