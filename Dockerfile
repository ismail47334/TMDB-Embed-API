# ---------- Build Stage ----------
FROM node:22-slim AS build
ARG VERSION=dev
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
RUN npx puppeteer browsers install chrome

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

ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    APP_VERSION=${VERSION} \
    PUPPETEER_CACHE_DIR=/home/app/.cache/puppeteer

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app -m app && mkdir -p /home/app/.cache/puppeteer && chown -R app:app /home/app

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

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

CMD ["node","apiServer.js"]
