#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"
SCHEMA_SQL="$SCRIPT_DIR/schema.sql"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it from backend/.env.example first."
  exit 1
fi

if [[ ! -f "$SCHEMA_SQL" ]]; then
  echo "Missing $SCHEMA_SQL"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${DB_FILE:-}" ]]; then
  echo "Missing required env var: DB_FILE"
  exit 1
fi

DB_PATH="$ROOT_DIR/backend/${DB_FILE#./}"
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"

echo "[1/2] Resetting SQLite database file..."
rm -f "$DB_PATH" "$DB_PATH-shm" "$DB_PATH-wal"

echo "[2/2] Initializing schema from database/schema.sql..."
sqlite3 "$DB_PATH" < "$SCHEMA_SQL"

echo "Done. SQLite database initialized at: $DB_PATH"
