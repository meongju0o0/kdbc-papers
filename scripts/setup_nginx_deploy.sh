#!/usr/bin/env bash
set -euo pipefail

# Idempotent deploy setup for:
# 1) Nginx install and project server block
# 2) systemd service for backend
# 3) HTTPS with certbot (optional when DOMAIN/EMAIL are set)
#
# Usage:
#   bash scripts/setup_nginx_deploy.sh
#
# Optional env vars:
#   DOMAIN=example.com
#   EMAIL=admin@example.com
#   PROJECT_DIR=/home/ubuntu/kdbc-papers
#   SERVICE_NAME=kdbc-backend
#   BACKEND_PORT=4000
#   NGINX_PORT=8080
#   SERVER_NAME="example.com www.example.com"

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-kdbc-backend}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
NGINX_PORT="${NGINX_PORT:-8080}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="${SERVER_NAME:-$DOMAIN}"
else
  SERVER_NAME="${SERVER_NAME:-_}"
fi

BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
UPLOADS_DIR="$BACKEND_DIR/uploads"

NGINX_AVAILABLE="/etc/nginx/sites-available/${SERVICE_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
SYSTEMD_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "[ERROR] PROJECT_DIR does not exist: $PROJECT_DIR"
  exit 1
fi

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "[ERROR] backend directory not found: $BACKEND_DIR"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
  echo "[ERROR] backend/package.json not found"
  exit 1
fi

run_root() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

safe_apt_update() {
  echo "[INFO] Running apt-get update..."
  if run_root apt-get update -y; then
    return 0
  fi

  echo "[WARN] apt-get update failed, likely due to broken third-party repositories."
  echo "[INFO] Retrying update with Ubuntu base sources only (/etc/apt/sources.list)."

  run_root apt-get update -y \
    -o Dir::Etc::sourcelist="sources.list" \
    -o Dir::Etc::sourceparts="-" \
    -o APT::Get::List-Cleanup="0"
}

ensure_package() {
  local pkg="$1"
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "[SKIP] Package already installed: $pkg"
  else
    echo "[INFO] Installing package: $pkg"
    run_root apt-get install -y "$pkg"
  fi
}

sync_root_file() {
  local target="$1"
  local mode="$2"
  local label="$3"
  local renderer="$4"
  local tmp_file

  tmp_file="$(mktemp)"
  "$renderer" > "$tmp_file"

  if [[ -f "$target" ]] && cmp -s "$tmp_file" "$target"; then
    rm -f "$tmp_file"
    echo "[SKIP] ${label} already up-to-date: $target"
    return 0
  fi

  run_root mv "$tmp_file" "$target"
  run_root chmod "$mode" "$target"
  echo "[OK] ${label} synced: $target"
}

render_nginx_config() {
  cat <<EOF
server {
    listen ${NGINX_PORT};
    listen [::]:${NGINX_PORT};
    server_name ${SERVER_NAME};

    client_max_body_size 100M;

    root ${DIST_DIR};
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${UPLOADS_DIR}/;
        autoindex off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
}

render_systemd_service() {
  cat <<EOF
[Unit]
Description=KDBC Backend Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${BACKEND_DIR}
Environment=HOME=${service_home}
ExecStart=/bin/bash -lc 'if [[ -s "$HOME/.nvm/nvm.sh" ]]; then . "$HOME/.nvm/nvm.sh"; fi; npm run start'
Restart=always
RestartSec=3
Environment=NODE_ENV=production
User=${service_user}
Group=${service_user}

[Install]
WantedBy=multi-user.target
EOF
}

echo "[STEP 1/7] Installing required packages (idempotent)..."
safe_apt_update
ensure_package nginx
ensure_package certbot
ensure_package python3-certbot-nginx

if [[ ! -d "$DIST_DIR" ]]; then
  echo "[STEP 2/7] Frontend dist not found. Building frontend..."
  (cd "$FRONTEND_DIR" && npm install && npm run build)
else
  echo "[SKIP] Frontend dist already exists: $DIST_DIR"
fi

echo "[STEP 3/7] Syncing Nginx server block..."
sync_root_file "$NGINX_AVAILABLE" 644 "Nginx config" render_nginx_config

echo "[STEP 4/7] Enabling Nginx site..."
if [[ -L "$NGINX_ENABLED" || -e "$NGINX_ENABLED" ]]; then
  echo "[SKIP] Nginx site already enabled: $NGINX_ENABLED"
else
  run_root ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  echo "[OK] Symlink created: $NGINX_ENABLED"
fi

if [[ -e /etc/nginx/sites-enabled/default ]]; then
  echo "[INFO] Disabling default nginx site"
  run_root rm -f /etc/nginx/sites-enabled/default
fi

echo "[STEP 5/7] Syncing systemd service for backend..."
service_user="${SUDO_USER:-$USER}"
service_home="$(getent passwd "$service_user" | cut -d: -f6)"
if [[ -z "$service_home" ]]; then
  echo "[ERROR] Could not determine home directory for user: $service_user"
  exit 1
fi
sync_root_file "$SYSTEMD_FILE" 644 "systemd service" render_systemd_service

echo "[STEP 6/7] Reloading services and validating Nginx..."
run_root systemctl daemon-reload
run_root systemctl enable --now "$SERVICE_NAME"
run_root nginx -t

if run_root systemctl is-active --quiet nginx; then
  run_root systemctl reload nginx
else
  echo "[INFO] nginx is inactive. Attempting to start nginx..."
  if run_root systemctl enable --now nginx; then
    echo "[OK] nginx started successfully"
  else
    echo "[ERROR] Failed to start nginx. Port ${NGINX_PORT} may already be in use by another service."
    echo "        Check port usage: sudo ss -ltnp | grep ':${NGINX_PORT} '"
    echo "        Check service logs: sudo systemctl status nginx --no-pager -l"
    exit 1
  fi
fi

echo "[STEP 7/7] HTTPS setup (certbot)"
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  if [[ "$NGINX_PORT" != "80" ]]; then
    echo "[SKIP] NGINX_PORT=${NGINX_PORT}. HTTP-01 certbot with --nginx usually requires port 80."
    echo "      Use NGINX_PORT=80 for automatic certbot, or issue certs via DNS challenge."
    echo "      Example: sudo certbot certonly --manual --preferred-challenges dns -d <domain>"
    echo "      Then configure ssl_certificate/ssl_certificate_key manually in nginx config."
    exit 0
  fi
  cert_path="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  if [[ -f "$cert_path" ]]; then
    echo "[SKIP] Certificate already exists: $cert_path"
  else
    run_root certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect
    echo "[OK] HTTPS certificate issued for $DOMAIN"
  fi
else
  echo "[SKIP] DOMAIN/EMAIL not set. HTTPS not configured."
  echo "      To enable HTTPS later, run:"
  echo "      sudo certbot --nginx -d <domain> -m <email> --agree-tos --no-eff-email --redirect"
fi

echo "[DONE] Deploy bootstrap completed."

echo "\nQuick checks:"
echo "  sudo systemctl status ${SERVICE_NAME} --no-pager"
echo "  sudo systemctl status nginx --no-pager"
echo "  curl -I http://127.0.0.1:${NGINX_PORT}/"
echo "  curl -I http://127.0.0.1:${BACKEND_PORT}/api/health || true"
