# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — build
###############################################################################
FROM node:22-alpine AS build

# Don't run husky's prepare hook (no git repo inside the image).
ENV HUSKY=0

WORKDIR /app

# Install all deps (dev deps included) for building.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the source and build the production bundle ("vite build").
COPY . .
RUN npm run build

###############################################################################
# Stage 2 — production runtime
###############################################################################
FROM node:22-alpine AS runtime

ENV HUSKY=0 \
    NODE_ENV=production

WORKDIR /app

# Install only production deps. tsx is a runtime dependency (used by the
# migration runner), so it is available here; native modules (better-sqlite3,
# sharp) are compiled for this platform by npm ci.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the built output produced in the build stage.
COPY --from=build /app/build ./build
# Migrations (drizzle/) and the migration runner are needed at startup.
COPY --from=build /app/drizzle ./drizzle

# The runtime server binds to HOST/PORT (default 0.0.0.0:3000).
EXPOSE 3000

# Apply pending migrations, then start the built Node server.
CMD ["sh", "-c", "node --import tsx drizzle/migrate.ts && node build"]