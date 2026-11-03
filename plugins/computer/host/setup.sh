#!/bin/bash
# The computer plugin's engine, set up once on the machine, as root. A user of its own runs the machine's container
# engine, podman or docker, rootless; its socket is where fxbot reaches it; its cpu, memory, and pids are delegated so
# limits hold; and a firewall keeps its computers to the internet. Safe to run again.
#
#   sudo bash setup.sh                 a release install in /opt/fxbot: the app gets the socket's folder
#   sudo bash setup.sh --user <login>  a checkout run by <login>, who joins the user's group to reach the socket
#   --engine podman|docker             a checkout's engine; a release install uses its own
#   --name <user>                      another user than fxbot-computer, for checks beside a real install
#   --install <folder>                 another release install than /opt/fxbot, for checks
#   --remove                           takes it all away: the user, its computers and files, the firewall, the override
set -euo pipefail

name=fxbot-computer engine="" login="" install=/opt/fxbot remove=""
while [ $# -gt 0 ]; do
  case $1 in
    --name | --engine | --user | --install) [ $# -ge 2 ] || { echo "setup.sh: $1 needs a value" >&2; exit 2; } ;;&
    --name) name=$2 && shift 2 ;;
    --engine) engine=$2 && shift 2 ;;
    --user) login=$2 && shift 2 ;;
    --install) install=$2 && shift 2 ;;
    --remove) remove=1 && shift ;;
    *) echo "setup.sh: unknown option $1" >&2 && exit 2 ;;
  esac
done
die() { echo "setup.sh: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run it as root: sudo bash $0"
[[ $name =~ ^[a-z][a-z0-9-]{0,30}$ ]] || die "--name must be a lowercase user name"
command -v systemctl >/dev/null && command -v apt-get >/dev/null || die "it needs systemd and apt: Debian 13 or Ubuntu 24.04"

home=/var/lib/$name
run=$home/run
sock=$run/engine.sock
table=${name//-/_}
rules=/etc/fxbot/$name.nft
unit=$name-firewall.service
override=$install/compose.override.yaml
marker="# Written by the computer plugin's setup.sh for $name."
# A release install, unless --user names a checkout's login.
release=""
[ -z "$login" ] && [ -f "$install/.env" ] && [ -x "$install/fxbot" ] && release=1
as() { runuser -u "$name" -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" "$@"; }

if [ -n "$remove" ]; then
  if uid=$(id -u "$name" 2>/dev/null); then
    as systemctl --user disable --now podman.socket podman.service docker.service >/dev/null 2>&1 || true
    loginctl disable-linger "$name" || true
    systemctl stop "user@$uid.service" 2>/dev/null || true
    pkill -KILL -u "$uid" 2>/dev/null || true
    sleep 1
    userdel "$name" 2>/dev/null || true
    sed -i "/^$name:/d" /etc/subuid /etc/subgid
    rm -rf "$home" "/etc/systemd/system/user@$uid.service.d/$name.conf"
    rmdir "/etc/systemd/system/user@$uid.service.d" 2>/dev/null || true
  fi
  systemctl disable --now "$unit" >/dev/null 2>&1 || true
  nft delete table inet "$table" 2>/dev/null || true
  rm -f "/etc/systemd/system/$unit" "$rules"
  systemctl daemon-reload
  if [ -n "$release" ] && grep -qxF "$marker" "$override" 2>/dev/null; then
    rm -f "$override"
    "$install/fxbot" up
  fi
  echo "Removed $name: its computers and files, its firewall${release:+, and $override}. The packages stay."
  exit 0
fi

# The engine fxbot itself runs on: a release install's, or else podman, or docker when only docker is installed.
if [ -z "$engine" ] && [ -n "$release" ]; then engine=$(sed -n 's/^FXBOT_ENGINE=//p' "$install/.env"); fi
if [ -z "$engine" ]; then
  if command -v podman >/dev/null; then engine=podman; elif command -v docker >/dev/null; then engine=docker; else engine=podman; fi
fi
[ "$engine" = podman ] || [ "$engine" = docker ] || die "--engine must be podman or docker"

need=(uidmap dbus-user-session nftables curl)
if [ "$engine" = podman ]; then
  need+=(podman passt)
elif dpkg -s docker-ce >/dev/null 2>&1; then
  need+=(docker-ce-rootless-extras slirp4netns)
elif dpkg -s docker.io >/dev/null 2>&1; then
  need+=(rootlesskit slirp4netns)
else
  die "docker here isn't Docker's docker-ce or the distribution's docker.io. Install one of those, or use --engine podman."
fi
missing=()
for package in "${need[@]}"; do dpkg -s "$package" >/dev/null 2>&1 || missing+=("$package"); done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Installing ${missing[*]}"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${missing[@]}" >/dev/null
fi
if [ "$engine" = podman ]; then
  version=$(podman --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
  [ "$(printf '%s\n4.9\n' "$version" | sort -V | head -1)" = 4.9 ] || die "podman $version is too old: the computer needs 4.9 or newer"
  binary=$(command -v podman)
else
  rootless=$(command -v dockerd-rootless.sh || echo /usr/share/docker.io/contrib/dockerd-rootless.sh)
  [ -x "$rootless" ] || die "dockerd-rootless.sh isn't installed"
  binary=$(command -v rootlesskit)
fi
# Ubuntu keeps unprivileged users from making user namespaces, but for programs an AppArmor profile lets.
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] && ! grep -rqsF -- "$binary" /etc/apparmor.d; then
  die "this machine keeps unprivileged users from making user namespaces, and no AppArmor profile lets $binary. Install the engine from packages, which carry one, and run this again."
fi

# The user, its home, and 65,536 subordinate ids past every range taken.
if ! id "$name" >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir "$home" --shell /usr/sbin/nologin --comment "fxbot's computers" "$name"
fi
uid=$(id -u "$name")
gid=$(id -g "$name")
chmod 0750 "$home"
if ! grep -q "^$name:" /etc/subuid; then
  first=$(awk -F: 'BEGIN { m = 100000 } { if ($2 + $3 > m) m = $2 + $3 } END { print m }' /etc/subuid /etc/subgid)
  usermod --add-subuids "$first-$((first + 65535))" --add-subgids "$first-$((first + 65535))" "$name"
fi

# Its own systemd, with cpu, memory, and pids delegated: without them, rootless limits are silently dropped.
dropin=/etc/systemd/system/user@$uid.service.d/$name.conf
mkdir -p "$(dirname "$dropin")"
if [ "$(cat "$dropin" 2>/dev/null)" != "$(printf '[Service]\nDelegate=cpu memory pids')" ]; then
  printf '[Service]\nDelegate=cpu memory pids\n' >"$dropin"
  systemctl daemon-reload
  systemctl try-restart "user@$uid.service"
fi
loginctl enable-linger "$name"
for _ in $(seq 100); do [ -S "/run/user/$uid/systemd/private" ] && break; sleep 0.1; done
[ -S "/run/user/$uid/systemd/private" ] || die "$name's systemd didn't start"
as systemctl --user start dbus.socket

# The engine's socket, in a folder of its own, which the app mounts: a socket made again keeps its path.
install -d -o "$name" -g "$name" -m 0750 "$run"
config=$home/.config
if [ "$engine" = podman ]; then
  install -d -o "$name" -g "$name" "$config" "$config/systemd" "$config/systemd/user" "$config/systemd/user/podman.socket.d"
  printf '[Socket]\nListenStream=\nListenStream=%s\nSocketMode=0660\n' "$sock" >"$config/systemd/user/podman.socket.d/fxbot.conf"
  as systemctl --user daemon-reload
  as systemctl --user enable podman.socket >/dev/null 2>&1
  as systemctl --user restart podman.socket
else
  # The unit dockerd-rootless-setuptool.sh writes, with the socket moved and its group left to the user's own.
  install -d -o "$name" -g "$name" "$config" "$config/docker" "$config/systemd" "$config/systemd/user"
  printf '{ "hosts": ["unix://%s"], "group": "" }\n' "$sock" >"$config/docker/daemon.json"
  cat >"$config/systemd/user/docker.service" <<EOF
[Unit]
Description=Docker, rootless, for fxbot's computers

[Service]
Environment=PATH=$(dirname "$rootless"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$rootless
ExecReload=/bin/kill -s HUP \$MAINPID
TimeoutSec=0
RestartSec=2
Restart=always
StartLimitBurst=3
StartLimitInterval=60s
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
Delegate=yes
Type=notify
NotifyAccess=all
KillMode=mixed

[Install]
WantedBy=default.target
EOF
  chown -R "$name:$name" "$config"
  as systemctl --user daemon-reload
  as systemctl --user enable docker.service >/dev/null 2>&1
  as systemctl --user restart docker.service
fi
chown -R "$name:$name" "$config"

# The firewall: its connections reach the internet and DNS, and nothing on this machine, its tailnet, or its networks.
# DNS goes to the machine's resolvers, and, as rootless Docker's containers ask them, systemd-resolved's upstream ones.
servers=$(awk '/^nameserver/ { print $2 }' /etc/resolv.conf /run/systemd/resolve/resolv.conf 2>/dev/null | sort -u)
dns4=$(grep -v : <<<"$servers" | paste -sd, - || true)
dns6=$(grep : <<<"$servers" | paste -sd, - || true)
accept4="" accept6=""
[ -z "$dns4" ] || accept4="ip daddr { $dns4 } meta l4proto { tcp, udp } th dport 53 accept"
[ -z "$dns6" ] || accept6="ip6 daddr { $dns6 } meta l4proto { tcp, udp } th dport 53 accept"
mkdir -p /etc/fxbot
cat >"$rules" <<EOF
# Written by the computer plugin's setup.sh: the user $name's connections reach the internet only.
table inet $table
delete table inet $table
table inet $table {
  chain output {
    type filter hook output priority 0; policy accept;
    meta skuid != $uid accept
    $accept4
    $accept6
    fib daddr type local reject with icmpx admin-prohibited
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 } reject with icmpx admin-prohibited
    ip6 daddr { ::1, fc00::/7, fe80::/10, ff00::/8 } reject with icmpx admin-prohibited
  }
}
EOF
cat >"/etc/systemd/system/$unit" <<EOF
[Unit]
Description=The firewall for $name's computers
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f $rules
ExecStop=/usr/sbin/nft delete table inet $table

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$unit" >/dev/null 2>&1
systemctl restart "$unit"

# Who reaches the socket: the app's container through compose.override.yaml, or a checkout's login.
if [ -n "$release" ]; then
  if [ -f "$override" ] && ! grep -qxF "$marker" "$override"; then
    die "$override is someone else's. Add to it: the volume $run:/run/fxbot-computer and group_add $gid on the fxbot service."
  fi
  printf '%s\nservices:\n  fxbot:\n    volumes: [ "%s:/run/fxbot-computer" ]\n    group_add: [ "%s" ]\n' "$marker" "$run" "$gid" >"$override"
  "$install/fxbot" up
fi
[ -z "$login" ] || usermod -aG "$name" "$login"

for _ in $(seq 100); do [ -S "$sock" ] && break; sleep 0.2; done
info=$(curl -fsS --unix-socket "$sock" http://engine/info) || die "the engine doesn't answer on $sock. See: sudo journalctl _UID=$uid"
grep -q 'name=rootless' <<<"$info" || die "the engine on $sock isn't rootless"
echo "The computers' engine is ready: $engine, rootless, for the user $name."
if [ -n "$release" ]; then
  echo "fxbot reaches it at /run/fxbot-computer/engine.sock."
else
  echo "fxbot reaches it at $sock${login:+, as $login}. The computer plugin finds it there when its user is fxbot-computer; otherwise set its engine setting to that path."
fi
echo "In place: the user $name and its home $home, its systemd, $rules and $unit${release:+, and $override}${login:+, and the groups of $login}."
