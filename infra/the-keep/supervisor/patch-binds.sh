#!/bin/sh
# Adds DOCKER_RUNNER_BINDS to the compiled Docker workload manager: comma-separated host:container[:mode] binds for every run (D-042).
set -eu
file=${1:-/app/apps/supervisor/dist/workloadManager/docker.js}
anchor='AutoRemove: !!this.opts.dockerAutoremove,'
binds='Binds: (process.env.DOCKER_RUNNER_BINDS ?? "").split(",").map((b) => b.trim()).filter(Boolean),'
grep -qF "$anchor" "$file" || { echo "anchor not found in $file, upstream changed: update the patch" >&2; exit 1; }
sed -i "s|$anchor|$anchor $binds|" "$file"
grep -qF 'DOCKER_RUNNER_BINDS' "$file" || { echo "patch did not apply" >&2; exit 1; }
echo "patched $file"
