#!/bin/sh
# Renders /app/slskd.yml from env, with Proton's forwarded port as the Soulseek listen port (D-030).
set -eu

DEFAULT_PORT=50300
current=""

# slskd runs as the Trigger.dev runs' uid, so it can't create these itself and its files stay movable by the pipeline.
mkdir -p /downloads/.incomplete
chown 1000:1000 /downloads /downloads/.incomplete
chown -R 1000:1000 /app

# Single-quoted YAML scalars, so passwords with : # or quotes stay intact.
q() {
	printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

render() {
	cat > /app/slskd.yml.tmp <<YAML
directories:
  downloads: /downloads
  incomplete: /downloads/.incomplete
shares:
  directories:
    - /music
soulseek:
  username: $(q "$SLSK_USERNAME")
  password: $(q "$SLSK_PASSWORD")
  listen_port: $1
web:
  port: 5030
  authentication:
    username: $(q "$SLSKD_WEB_USERNAME")
    password: $(q "$SLSKD_WEB_PASSWORD")
    api_keys:
      lyterion:
        key: $(q "$SLSKD_API_KEY")
        cidr: 0.0.0.0/0,::/0
YAML
	chown 1000:1000 /app/slskd.yml.tmp
	mv /app/slskd.yml.tmp /app/slskd.yml
	echo "slskd listen port: $1"
}

while true; do
	port=$(cat /gluetun/forwarded_port 2>/dev/null || true)
	port=${port:-$DEFAULT_PORT}
	if [ "$port" != "$current" ]; then
		render "$port"
		current=$port
	fi
	sleep 30
done
