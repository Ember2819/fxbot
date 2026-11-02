#!/usr/bin/env bash
# Installs fxbot on Debian or Ubuntu as containers, from a release tag: the newest, or the one named.
#
#   curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash -s -- v0.3.0
#
# It uses podman, or docker when only docker is installed, and installs podman and Compose when neither is. Then the
# fxbot user with its key, /opt/fxbot (the release's compose.yaml, an .env, and the fxbot command), and the systemd
# units. An install of 0.2, which ran on the machine's own Postgres, moves into the database container. Running it
# again finishes an install that stopped, and leaves a working one alone. Updates come from Settings or `fxbot update`.
# FXBOT_FILES, FXBOT_IMAGE, and FXBOT_RELEASES_URL point it at a mirror.
set -euo pipefail

files=${FXBOT_FILES:-https://raw.githubusercontent.com/iammrduncan/fxbot}
releases=${FXBOT_RELEASES_URL:-https://api.github.com/repos/iammrduncan/fxbot/releases/latest}
want=${1:-}
install=/opt/fxbot
etc=/etc/fxbot
var=/var/lib/fxbot

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\nfxbot setup stopped: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run it as root, such as with: curl -fsSL <this address> | sudo bash"
command -v apt-get >/dev/null || die "this script is for Debian and Ubuntu. Elsewhere, follow the README's steps."
case "$want" in "" | v[0-9]*.[0-9]*.[0-9]*) ;; *) die "name a release such as v0.3.0, not $want" ;; esac
cd /
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release

say "The container engine"
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl >/dev/null
# Compose v2 is docker-compose on Debian, and docker-compose-v2 on Ubuntu. Debian 12 and Ubuntu 22.04 have none.
case "$ID" in
  debian) compose_package=docker-compose recent=$([ "${VERSION_ID%%.*}" -ge 13 ] && echo yes || echo no) ;;
  ubuntu) compose_package=docker-compose-v2 recent=$([ "${VERSION_ID%%.*}" -ge 24 ] && echo yes || echo no) ;;
  *) compose_package="" recent=no ;;
esac
if command -v podman >/dev/null; then
  engine=podman
elif command -v docker >/dev/null; then
  engine=docker
else
  [ "$recent" = yes ] || die "$PRETTY_NAME has no Compose v2 package. Install Docker from Docker's repository (https://docs.docker.com/engine/install/), then run this again."
  apt-get install -y -qq --no-install-recommends podman "$compose_package" >/dev/null
  engine=podman
fi
if [ "$engine" = podman ]; then
  # `podman compose` runs docker-compose, which reaches podman through its socket.
  if ! command -v docker-compose >/dev/null && [ ! -x /usr/libexec/docker/cli-plugins/docker-compose ]; then
    [ "$recent" = yes ] || die "podman is here, but $PRETTY_NAME has no Compose v2 package. Install Docker from Docker's repository, or docker-compose, then run this again."
    apt-get install -y -qq --no-install-recommends "$compose_package" >/dev/null
  fi
  [ -d /run/systemd/system ] && systemctl enable --now podman.socket >/dev/null 2>&1
  PODMAN_COMPOSE_WARNING_LOGS=false podman compose version >/dev/null 2>&1 || die "podman compose doesn't run. See: podman compose version"
else
  docker compose version >/dev/null 2>&1 || die "docker is here without Compose v2. Install Docker's compose plugin, then run this again."
fi
echo "$engine"

say "The fxbot user, its folders, and its key"
id fxbot >/dev/null 2>&1 || useradd --system --home-dir "$var" --create-home --shell /usr/sbin/nologin fxbot
install -d -o fxbot -g fxbot -m 700 "$var" "$var/data" "$var/backups"
install -d -o fxbot -g fxbot -m 755 "$var/control" "$var/control/requests"
install -d -m 755 "$etc" "$install"
if [ ! -f "$etc/secret.key" ]; then
  (umask 377 && head -c 32 /dev/urandom | base64 >"$etc/secret.key")
  chown fxbot:fxbot "$etc/secret.key"
fi
[ -f "$etc/fxbot.env" ] || printf '# Settings for the app, such as FXBOT_LISTS_URL. None is a secret: the key is a file only fxbot reads.\n' >"$etc/fxbot.env"

# A 0.2 install ran from /opt/fxbot/current on the machine's Postgres, under its own fxbot.service.
moving=no
if [ -L "$install/current" ] && [ ! -f "$install/.env" ]; then moving=yes; fi

if [ -f "$install/.env" ]; then
  tag=v$(sed -n 's/^FXBOT_VERSION=//p' "$install/.env")
  say "fxbot ${tag#v} is installed already"
else
  tag=${want:-v$(curl -fsSL "$releases" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)}
  [ "$tag" != v ] || die "couldn't find the newest release at $releases"
  say "fxbot ${tag#v}"
  curl -fsSL "$files/$tag/deploy/compose.yaml" -o "$install/compose.yaml" || die "couldn't download $tag's compose.yaml from $files"
  curl -fsSL "$files/$tag/deploy/fxbot" -o "$install/fxbot" || die "couldn't download $tag's fxbot command from $files"
  chmod 755 "$install/fxbot"
  (
    umask 077
    cat >"$install/.env.new" <<EOF
# fxbot's install: setup.sh wrote this, and \`fxbot update\` changes the version.
FXBOT_VERSION=${tag#v}
FXBOT_UID=$(id -u fxbot)
FXBOT_GID=$(id -g fxbot)
FXBOT_ENGINE=$engine
FXBOT_DB_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
EOF
    for name in FXBOT_IMAGE FXBOT_FILES FXBOT_RELEASES_URL; do [ -z "${!name:-}" ] || echo "$name=${!name}" >>"$install/.env.new"; done
  )
fi
ln -sfn "$install/fxbot" /usr/local/bin/fxbot

if [ "$moving" = yes ]; then
  say "Moving the 0.2 install into containers"
  if [ -d /run/systemd/system ]; then
    systemctl disable --now fxbot >/dev/null 2>&1 || true
    [ -f /etc/systemd/system/fxbot.service ] && cp /etc/systemd/system/fxbot.service "$install/fxbot-0.2.service"
  fi
  folder="$var/backups/$(date -u +%Y-%m-%dT%H-%M-%SZ)-move-to-containers"
  install -d -o fxbot -g fxbot -m 700 "$folder"
  runuser -u postgres -- pg_dump --format=custom fxbot >"$folder/database.dump" || die "couldn't dump the 0.2 database"
  chown fxbot:fxbot "$folder/database.dump"
  mv "$install/.env.new" "$install/.env"
  (cd "$install" && ./fxbot restore "$folder") || die "the 0.2 database didn't restore into the container. The 0.2 install is untouched: see $install/fxbot-0.2.service"
  # The app's database, key, and folders now come from compose. 0.2's settings are kept, for going back.
  cp -p "$etc/fxbot.env" "$install/fxbot-0.2.env"
  sed -i '/^FXBOT_DATABASE_URL=\|^PGHOST=\|^PGPORT=\|^FXBOT_SECRET_KEY_FILE=\|^FXBOT_DATA=\|^FXBOT_BACKUPS=/d' "$etc/fxbot.env"
fi
[ ! -f "$install/.env.new" ] || mv "$install/.env.new" "$install/.env"

if [ ! -d /run/systemd/system ]; then
  say "fxbot ${tag#v} is installed. This machine has no systemd, so start it yourself: sudo fxbot up"
  exit 0
fi
say "The services"
if [ "$engine" = podman ]; then needs=podman.socket; else needs=docker.service; fi
cat >/etc/systemd/system/fxbot.service <<EOF
[Unit]
Description=fxbot
Wants=network-online.target
After=network-online.target $needs
Requires=$needs

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$install/fxbot up
ExecStop=$install/fxbot down
TimeoutStartSec=10min

[Install]
WantedBy=multi-user.target
EOF
# The app asks for an update by writing a request; this hands it to the fxbot command.
cat >/etc/systemd/system/fxbot-control.path <<EOF
[Unit]
Description=fxbot's requests

[Path]
DirectoryNotEmpty=$var/control/requests

[Install]
WantedBy=multi-user.target
EOF
cat >/etc/systemd/system/fxbot-control.service <<EOF
[Unit]
Description=fxbot's requests

[Service]
Type=oneshot
ExecStart=$install/fxbot apply
EOF
if ! systemctl is-active --quiet fxbot && (exec 3<>/dev/tcp/127.0.0.1/8787) 2>/dev/null; then
  die "another program listens on port 8787, which fxbot needs. A checkout's npm run dev uses 8788; move the other program, then run this again."
fi
systemctl daemon-reload
systemctl enable --now fxbot-control.path >/dev/null 2>&1
systemctl enable fxbot >/dev/null 2>&1
systemctl start fxbot || die "fxbot did not start. See: sudo fxbot logs"
curl -fs http://127.0.0.1:8787/api/health >/dev/null || die "fxbot did not answer. See: sudo fxbot logs"

say "fxbot ${tag#v} runs on http://127.0.0.1:8787"
echo "Open it there. From your other devices, Tailscale is the simplest way in:  tailscale serve --bg 8787"
echo "Settings shows each new release, with an Update button. Or: sudo fxbot update"
if [ "$moving" = yes ]; then
  echo
  echo "The 0.2 install moved into containers. Its own files and database are still here, untouched; see: sudo fxbot status"
fi
