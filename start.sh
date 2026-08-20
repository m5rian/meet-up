#!/usr/bin/env sh
#
# Build & start script for Meet-Up.
#
#   1. Installs dependencies (unless already installed)
#   2. Generates + applies pending Drizzle migrations
#   3. Starts the built Node server
#
# Requires Node >= 22 (better-sqlite3@13). Set DATABASE_PATH / ENCRYPTION_KEY
# etc. in the environment or a local `.env` file (see .env.example).
set -e

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
	npm install
fi

# Load `.env` if present (simple KEY=VALUE loader, no dependencies).
if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

# Apply any pending migrations before booting.
node --import tsx drizzle/migrate.ts

npm run build

echo "Starting Meet-Up server…"
exec node build