#!/bin/bash

set -e

if [ "$#" -lt 3 ]; then
  echo "Usage: ./reset_password.sh <username> <old-password> <new-password>"
  echo "Example: ./reset_password.sh admin 'CurrentPass!123' 'NewStrongPass!234'"
  exit 1
fi

USERNAME="$1"
OLD_PASSWORD="$2"
NEW_PASSWORD="$3"

cd "../backend"

npm run reset-password -- \
  --username "$USERNAME" \
  --old-password "$OLD_PASSWORD" \
  --new-password "$NEW_PASSWORD"
