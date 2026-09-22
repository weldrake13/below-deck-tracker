# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:26-bookworm-slim AS build

WORKDIR /app

# Dependencies are copied and installed first so this layer is reused whenever
# only application source has changed.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# -------------------------------------------------------------- runtime stage
FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_DIR=/app/content

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled server, plus the browser assets it serves at runtime.
COPY --from=build /app/dist ./dist
COPY src/public ./src/public

# Baked in so the image runs standalone; docker-compose bind-mounts over this
# so editing content/yachts.json doesn't need a rebuild.
COPY content ./content

RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
