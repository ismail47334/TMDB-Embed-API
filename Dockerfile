# ---------- Build Stage ----------
FROM node:22-alpine AS build
ARG VERSION=dev
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source code
COPY apiServer.js ./
COPY providers ./providers
COPY proxy ./proxy
COPY public ./public
COPY utils ./utils
COPY README.md ./

# ---------- Runtime Stage ----------
FROM node:22-alpine AS runtime
ARG VERSION=dev
WORKDIR /app

# Environment variables - PORT is set by Render dashboard (8787)
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    APP_VERSION=${VERSION}

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy built artifacts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apiServer.js ./
COPY --from=build /app/public ./public
COPY --from=build /app/providers ./providers
COPY --from=build /app/proxy ./proxy
COPY --from=build /app/utils ./utils
COPY --from=build /app/package.json ./
COPY --from=build /app/README.md ./

# Expose port (documentational)
EXPOSE 8787

# Set permissions
RUN chown -R app:app /app
USER app

# Labels
LABEL org.opencontainers.image.title="TMDB Embed API" \
    org.opencontainers.image.description="Streaming metadata + source aggregation API" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.source="https://github.com/Inside4ndroid/TMDB-Embed-API" \
    org.opencontainers.image.licenses="MIT"

# Healthcheck - uses PORT from environment
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

CMD ["node","apiServer.js"]
