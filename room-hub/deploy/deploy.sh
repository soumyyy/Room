#!/usr/bin/env bash
# Deploys room-hub to the server and restarts it. Run from anywhere:
#   room-hub/deploy/deploy.sh            # host defaults to "friday"
#   ROOM_HUB_HOST=otherhost room-hub/deploy/deploy.sh
#
# Never edit files under ~/room/hub on the server: this script overwrites them.
set -euo pipefail

HOST="${ROOM_HUB_HOST:-friday}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

(cd "$HERE" && npm test --silent >/dev/null) || { echo "tests failed; not deploying" >&2; exit 1; }

ssh "$HOST" 'mkdir -p ~/room/hub ~/room/config ~/.config/systemd/user && chmod 700 ~/room/config'
rsync -a --delete \
  "$HERE/src" "$HERE/package.json" "$HERE/README.md" "$HERE/.env.example" "$HERE/deploy" \
  "$HOST:room/hub/"
rsync -a "$REPO/home-control/devices.json" "$HOST:room/hub/devices.json"
rsync -a "$HERE/deploy/server-README.md" "$HOST:room/README.md"

ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
if [ ! -f ~/room/config/hub.env ]; then
  sed "s|^ROOM_HUB_TOKEN=.*|ROOM_HUB_TOKEN=$(openssl rand -hex 32)|" ~/room/hub/.env.example > ~/room/config/hub.env
  chmod 600 ~/room/config/hub.env
  echo "created ~/room/config/hub.env with a new token"
fi
cp ~/room/hub/deploy/room-hub.service ~/.config/systemd/user/room-hub.service
systemctl --user daemon-reload
systemctl --user enable --now room-hub.service >/dev/null
systemctl --user restart room-hub.service
sleep 1
curl -fsS "http://127.0.0.1:$(grep ^PORT= ~/room/config/hub.env | cut -d= -f2 || echo 8787)/healthz" && echo " — room-hub is up"
REMOTE
