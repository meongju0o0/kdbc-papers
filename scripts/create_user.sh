#!/bin/bash

set -e

if [ "$#" -lt 2 ]; then
	echo "Usage: ./create_user.sh <username> <password> [approved]"
	echo "Example: ./create_user.sh admin 'Admin!1234' 1"
	exit 1
fi

USERNAME="$1"
PASSWORD="$2"
APPROVED="${3:-1}"

cd "../backend"

npm run create-user -- \
	--username "$USERNAME" \
	--password "$PASSWORD" \
	--approved "$APPROVED"