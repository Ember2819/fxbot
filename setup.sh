#!/usr/bin/env bash
# Installs fxbot on Debian or Ubuntu from a release tag: the newest, or the one named.
#
#   curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash -s -- v0.2.0
#
# It installs git and Postgres, Node 22 when the machine has no Node 22.18 or newer (checked against nodejs.org's
# checksums), the fxbot user with its database and key, the release in /opt/fxbot, and fxbot.service. Running it again
# finishes an install that stopped, and leaves a working one alone. Updates come from Settings or `npm run update`.
# FXBOT_REPO and FXBOT_NODE_DIST point it at a mirror.
set -euo pipefail

repo=${FXBOT_REPO:-https://github.com/iammrduncan/fxbot.git}
node_dist=${FXBOT_NODE_DIST:-https://nodejs.org/dist/latest-v22.x}
want=${1:-}
install=/opt/fxbot
etc=/etc/fxbot
var=/var/lib/fxbot

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\nfxbot setup stopped: %s\n' "$*" >&2
  exit 1
}
as_fxbot() { runuser -u fxbot -- env HOME="$var" PATH="$PATH" "$@"; }
node_ok() { command -v node >/dev/null && node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)'; }

[ "$(id -u)" -eq 0 ] || die "run it as root, such as with: curl -fsSL <this address> | sudo bash"
command -v apt-get >/dev/null || die "this script is for Debian and Ubuntu. Elsewhere, follow the README's steps."
case "$want" in "" | v[0-9]*.[0-9]*.[0-9]*) ;; *) die "name a release such as v0.2.0, not $want" ;; esac
cd /

say "Packages: git and Postgres"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl git postgresql xz-utils >/dev/null

if node_ok; then
  say "Node $(node --version) is already here"
else
  say "Node 22, from nodejs.org"
  case "$(dpkg --print-architecture)" in
    amd64) arch=x64 ;;
    arm64) arch=arm64 ;;
    *) die "Node has no build for $(dpkg --print-architecture)" ;;
  esac
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$node_dist/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(awk -v want="-linux-$arch.tar.xz" 'substr($2, length($2) - length(want) + 1) == want { print $2; exit }' "$tmp/SHASUMS256.txt")
  [ -n "$file" ] || die "$node_dist has no Node for linux-$arch"
  curl -fsSL "$node_dist/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum --check --status) || die "Node's download does not match its checksum, so nothing was installed"
  tar -xJf "$tmp/$file" -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE
  hash -r
  node_ok || die "Node did not install"
fi
node=$(command -v node)

say "Postgres"
if ! runuser -u postgres -- pg_isready -q; then
  if [ -d /run/systemd/system ]; then
    systemctl start postgresql
  else
    # A container without systemd: start the first cluster by hand.
    read -r version name < <(pg_lsclusters --no-header | awk 'NR == 1 { print $1, $2 }')
    pg_ctlcluster "$version" "$name" start
  fi
  for _ in $(seq 30); do runuser -u postgres -- pg_isready -q && break || sleep 1; done
  runuser -u postgres -- pg_isready -q || die "Postgres did not start"
fi

say "The fxbot user, its database, and its key"
id fxbot >/dev/null 2>&1 || useradd --system --home-dir "$var" --create-home --shell /usr/sbin/nologin fxbot
install -d -o fxbot -g fxbot -m 700 "$var" "$var/data" "$var/backups" "$etc"
# Peer auth: only the OS user fxbot connects, as the role fxbot, with no password.
runuser -u postgres -- psql -tAc "select 1 from pg_roles where rolname = 'fxbot'" | grep -q 1 || runuser -u postgres -- createuser fxbot
runuser -u postgres -- psql -tAc "select 1 from pg_database where datname = 'fxbot'" | grep -q 1 || runuser -u postgres -- createdb -O fxbot fxbot
if [ ! -f "$etc/secret.key" ]; then
  (umask 377 && head -c 32 /dev/urandom | base64 >"$etc/secret.key")
  chown fxbot:fxbot "$etc/secret.key"
fi

install -d -o fxbot -g fxbot -m 755 "$install" "$install/releases"
[ -d "$install/repo/.git" ] || as_fxbot git clone --quiet --no-checkout "$repo" "$install/repo"
as_fxbot git -C "$install/repo" fetch --quiet --tags --force origin
if [ -L "$install/current" ]; then
  tag=$(basename "$(readlink "$install/current")")
  say "fxbot ${tag#v} is installed already"
else
  tag=${want:-$(as_fxbot git -C "$install/repo" tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)}
  [ -n "$tag" ] || die "$repo has no releases yet"
  as_fxbot git -C "$install/repo" rev-parse -q --verify "refs/tags/$tag" >/dev/null || die "$repo has no release $tag"
  say "fxbot ${tag#v}"
  folder="$install/releases/$tag"
  if [ -e "$folder" ]; then as_fxbot git -C "$install/repo" worktree remove --force "$folder" 2>/dev/null || rm -rf "$folder"; fi
  as_fxbot git -C "$install/repo" worktree prune
  as_fxbot git -C "$install/repo" worktree add --quiet --detach "$folder" "$tag"
  (cd "$folder" && as_fxbot npm ci --no-audit --no-fund --loglevel=error && as_fxbot npm run build --silent) || die "$tag did not build"
  as_fxbot ln -sfn "releases/$tag" "$install/current"
fi

say "Settings and the service"
if [ ! -f "$etc/fxbot.env" ]; then
  # Debian's psql finds its cluster's port by itself; fxbot is told it.
  port=$(pg_lsclusters --no-header | awk 'NR == 1 { print $3 }')
  cat >"$etc/fxbot.env" <<EOF
# fxbot's settings. None of these is a secret: the key is a file only fxbot reads.
FXBOT_DATABASE_URL=postgres:///fxbot
PGHOST=/var/run/postgresql
PGPORT=${port:-5432}
FXBOT_SECRET_KEY_FILE=$etc/secret.key
FXBOT_DATA=$var/data
FXBOT_BACKUPS=$var/backups
EOF
  chown fxbot:fxbot "$etc/fxbot.env"
  chmod 600 "$etc/fxbot.env"
fi
if [ ! -d /run/systemd/system ]; then
  say "fxbot ${tag#v} is installed. This machine has no systemd, so start it yourself:"
  echo "  cd $install/current && runuser -u fxbot -- $node --env-file=$etc/fxbot.env packages/server/src/index.ts"
  exit 0
fi
# Exit code 75 is fxbot asking for a restart, after an update from Settings switched releases.
cat >/etc/systemd/system/fxbot.service <<EOF
[Unit]
Description=fxbot
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=fxbot
WorkingDirectory=$install/current
EnvironmentFile=$etc/fxbot.env
ExecStart=$node packages/server/src/index.ts
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now fxbot >/dev/null 2>&1
for _ in $(seq 60); do curl -fs http://127.0.0.1:8787/api/health >/dev/null && break || sleep 1; done
curl -fs http://127.0.0.1:8787/api/health >/dev/null || die "fxbot did not start. See: journalctl -u fxbot"

say "fxbot ${tag#v} runs on http://127.0.0.1:8787"
echo "Reach it from your other devices over Tailscale:  tailscale serve --bg 8787"
echo "Settings shows each new release, with an Update button. Or: cd $install/current && sudo -u fxbot -H npm run update"
