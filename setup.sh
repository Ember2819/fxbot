#!/usr/bin/env bash
# Installs fxbot on Debian or Ubuntu as containers, from a release tag: the newest, or the one named.
#
#   curl -fsSL https://fxbot.sh/setup.sh | sudo bash
#   curl -fsSL https://fxbot.sh/setup.sh | sudo bash -s -- v0.3.0
#
# It uses podman 4 or newer, or docker when that's what's here. With neither, it installs podman, or docker where the
# distro's podman is too old, and a Compose new enough when the machine's isn't. Then the fxbot user with its key, /opt/fxbot (the release's compose.yaml, an .env, and the
# fxbot command), and the systemd units. An install of 0.2, which ran on the machine's own Postgres, moves into the
# database container. Running it again finishes an install that stopped, and leaves a working one alone. Updates come
# from Settings or `fxbot update`. FXBOT_FILES, FXBOT_IMAGE, FXBOT_RELEASES_URL, and FXBOT_COMPOSE_FILES point it at a
# mirror.
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
at_least() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" = "$1" ]; }
candidate() { apt-cache policy "$1" | sed -n 's/^ *Candidate: \([0-9][0-9.]*\).*/\1/p'; }
# An install keeps its engine. Otherwise podman 4 or newer: before it, podman has no netavark, and Compose can't find the
# images it pulls. Then docker, then podman from apt, or docker from apt where apt's podman is too old (Ubuntu 22.04).
engine=$(sed -n 's/^FXBOT_ENGINE=//p' "$install/.env" 2>/dev/null) || true
if [ -z "$engine" ]; then
  if at_least 4 "$(podman --version 2>/dev/null | sed -n 's/.* \([0-9][0-9.]*\).*/\1/p')"; then
    engine=podman
  elif command -v docker >/dev/null; then
    engine=docker
  elif at_least 4 "$(candidate podman)"; then
    engine=podman
  else
    apt-get install -y -qq --no-install-recommends docker.io >/dev/null
    engine=docker
  fi
fi
if [ "$engine" = podman ]; then
  # Containers find each other by name through netavark and aardvark-dns, which podman only recommends. Debian 13's
  # netavark needs nft.
  apt-get install -y -qq --no-install-recommends podman netavark aardvark-dns nftables >/dev/null || echo "Couldn't install podman's network parts, so fxbot may not reach its database."
  # A podman that has run on CNI, as Debian 12's does out of the box, stays on it, and needs this plugin for names.
  if [ "$(podman info --format '{{.Host.NetworkBackend}}' 2>/dev/null)" = cni ]; then
    apt-get install -y -qq --no-install-recommends golang-github-containernetworking-plugin-dnsname >/dev/null || echo "Couldn't install CNI's dnsname plugin, so fxbot may not reach its database."
  fi
  # Compose reaches podman through its socket.
  [ ! -d /run/systemd/system ] || systemctl enable --now podman.socket >/dev/null 2>&1
else
  [ ! -d /run/systemd/system ] || systemctl enable --now docker >/dev/null 2>&1 || true
  for _ in $(seq 30); do docker info >/dev/null 2>&1 && break || sleep 1; done
  docker info >/dev/null 2>&1 || die "docker doesn't answer. Start it, then run this again."
fi
echo "$engine"

say "Compose"
install -d -m 755 "$install"
# Compose $compose_min or newer. `podman compose` and `docker compose` may not run one: Ubuntu's docker-compose package is
# v1, which podman prefers to a newer plugin beside it, podman before 4.7 has no compose command, and podman-compose
# can't wait for health. So when they can't, fxbot names a binary itself, in FXBOT_COMPOSE: one that's here already, a
# package when the distro's is new enough, or else Compose's own release, checked against its hash.
compose_min=2.26
compose_release=2.40.3
compose_files=${FXBOT_COMPOSE_FILES:-https://github.com/docker/compose/releases/download}
enough() { at_least "$compose_min" "$1"; }
version_of() { PODMAN_COMPOSE_WARNING_LOGS=false "$@" version --short 2>/dev/null | tail -n 1 | sed -n 's/^v\{0,1\}\([0-9][0-9.]*\).*/\1/p'; }
compose=""
find_compose() {
  enough "$(version_of "$engine" compose)" && return
  local binary
  for binary in "$install/docker-compose" /usr/libexec/docker/cli-plugins/docker-compose /usr/lib/docker/cli-plugins/docker-compose \
    /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose /usr/bin/docker-compose; do
    if [ -x "$binary" ] && enough "$(version_of "$binary")"; then
      compose=$binary
      return
    fi
  done
  return 1
}
compose_package() {
  local package
  # Docker's own first, on a machine with its repository: Ubuntu's clashes with it.
  for package in docker-compose-plugin docker-compose-v2 docker-compose; do
    if enough "$(candidate "$package")"; then
      apt-get install -y -qq --no-install-recommends "$package" >/dev/null && return
    fi
  done
  return 1
}
compose_download() {
  local arch sum
  case $(uname -m) in
    x86_64) arch=x86_64 sum=dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372 ;;
    aarch64) arch=aarch64 sum=d26373b19e89160546d15407516cc59f453030d9bc5b43ba7faf16f7b4980137 ;;
    *) die "this machine has no Compose $compose_min or newer, and Compose has no release for $(uname -m). Install one, then run this again." ;;
  esac
  curl -fsSL "$compose_files/v$compose_release/docker-compose-linux-$arch" -o "$install/docker-compose.new" || die "couldn't download Compose $compose_release from $compose_files"
  printf '%s  %s\n' "$sum" "$install/docker-compose.new" | sha256sum -c --status || die "the Compose $compose_release download isn't the file it should be"
  chmod 755 "$install/docker-compose.new"
  mv "$install/docker-compose.new" "$install/docker-compose"
}
find_compose || { compose_package && find_compose; } || { compose_download && find_compose; } ||
  die "Compose $compose_release doesn't run here. See: $install/docker-compose version"
echo "${compose:-$engine compose} $(version_of ${compose:-$engine compose})"

say "The fxbot user, its folders, and its key"
id fxbot >/dev/null 2>&1 || useradd --system --home-dir "$var" --create-home --shell /usr/sbin/nologin fxbot
install -d -o fxbot -g fxbot -m 700 "$var" "$var/data" "$var/backups"
install -d -o fxbot -g fxbot -m 755 "$var/control" "$var/control/requests"
install -d -m 755 "$etc"
if [ ! -f "$etc/secret.key" ]; then
  (umask 377 && head -c 32 /dev/urandom | base64 >"$etc/secret.key")
  chown fxbot:fxbot "$etc/secret.key"
fi
[ -f "$etc/fxbot.env" ] || printf '# Settings for the app, such as FXBOT_LISTS_URL. None is a secret: the key is a file only fxbot reads.\n' >"$etc/fxbot.env"

# An install that never reached its first start has nothing to keep, so it starts over from the newest release: one that
# stopped on an older Compose has a fxbot command that can't use another. Its settings stay beside it.
if [ -f "$install/.env" ] && ! "$engine" volume inspect fxbot_pgdata >/dev/null 2>&1; then
  mv "$install/.env" "$install/.env.stopped"
fi

# A 0.2 install ran from /opt/fxbot/current on the machine's Postgres, under its own fxbot.service.
moving=no
if [ -L "$install/current" ] && [ ! -f "$install/.env" ]; then moving=yes; fi

fresh=no
if [ -f "$install/.env" ]; then
  tag=v$(sed -n 's/^FXBOT_VERSION=//p' "$install/.env")
  say "fxbot ${tag#v} is installed already"
  sed -i '/^FXBOT_COMPOSE=/d' "$install/.env"
  [ -z "$compose" ] || echo "FXBOT_COMPOSE=$compose" >>"$install/.env"
else
  fresh=yes
  tag=${want:-v$(curl -fsSL "$releases" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)}
  [ "$tag" != v ] || die "couldn't find the newest release at $releases"
  say "fxbot ${tag#v}"
  curl -fsSL "$files/$tag/deploy/compose.yaml" -o "$install/compose.yaml" || die "couldn't download $tag's compose.yaml from $files"
  curl -fsSL "$files/$tag/deploy/fxbot" -o "$install/fxbot" || die "couldn't download $tag's fxbot command from $files"
  curl -fsSL "$files/$tag/deploy/compose.gpu.$engine.yaml" -o "$install/compose.gpu.$engine.yaml" || die "couldn't download $tag's GPU file from $files"
  # Releases before 0.5.0 have no such file.
  [ "$engine" != docker ] || curl -fsSL "$files/$tag/deploy/compose.docker.yaml" -o "$install/compose.docker.yaml" || true
  chmod 755 "$install/fxbot"
  (
    umask 077
    cat >"$install/.env.new" <<EOF
# fxbot's install: setup.sh wrote this, and \`fxbot update\` changes the version.
FXBOT_VERSION=${tag#v}
FXBOT_UID=$(id -u fxbot)
FXBOT_GID=$(id -g fxbot)
FXBOT_ENGINE=$engine
FXBOT_EMBEDDER=cpu
FXBOT_DB_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
EOF
    for name in FXBOT_IMAGE FXBOT_FILES FXBOT_RELEASES_URL; do [ -z "${!name:-}" ] || echo "$name=${!name}" >>"$install/.env.new"; done
    [ -z "$compose" ] || echo "FXBOT_COMPOSE=$compose" >>"$install/.env.new"
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

# A machine with an NVIDIA GPU runs the local embedder there, if a trial run reaches it.
if [ "$fresh" = yes ] && command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1; then
  say "The local embedder, on the GPU"
  fxbot embedder gpu || echo "No GPU answered a trial run, so the local embedder stays on the CPU."
fi

say "fxbot ${tag#v} runs on http://127.0.0.1:8787"
echo "Open it there. From your other devices, Tailscale is the simplest way in:  tailscale serve --bg 8787"
echo "Settings shows each new release, with an Update button. Or: sudo fxbot update"
if [ "$moving" = yes ]; then
  echo
  echo "The 0.2 install moved into containers. Its own files and database are still here, untouched; see: sudo fxbot status"
fi
