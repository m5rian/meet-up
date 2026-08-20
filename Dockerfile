# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — build
###############################################################################
FROM node:22-alpine AS build

WORKDIR /app

# Install build tools for native C++ addons like better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# Skip lifecycle scripts during dependency installation
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

###############################################################################
# Stage 2 — production runtime
###############################################################################
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
# Use --ignore-scripts to skip husky/prepare hooks during production install
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev --ignore-scripts \
    && apk del python3 make g++

COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle

EXPOSE 3000

CMD ["sh", "-c", "node --import tsx drizzle/migrate.ts && node build"]
