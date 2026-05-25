#!/bin/bash

set -e

if [ "$#" -lt 1 ]; then
  echo "Usage: ./delete_user.sh <username>"
  echo "Example: ./delete_user.sh admin"
  exit 1
fi

USERNAME="$1"

cd "../backend"

npm run delete-user -- --username "$USERNAME"
