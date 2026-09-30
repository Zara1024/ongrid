#!/usr/bin/env bash
# Copy immutable runtime dependency images into zara1024 OpsPilot CNB.
#
# SRC for most deps: public ongridio mirrors (already exist there).
# frontier: prefer docker.io/singchia/frontier (CNB registry-copy often EOFs).
#
# Usage:
#   docker login docker.cnb.cool -u cnb -p "$CNB_TOKEN"
#   bash scripts/sync-cnb-dep-images.sh
set -euo pipefail

SRC_NS=${SRC_NS:-docker.cnb.cool/ongridio/ongrid}
DST_NS=${DST_NS:-docker.cnb.cool/zara1024/opspilot}
SRC_PCAP=${SRC_PCAP:-docker.cnb.cool/ongridio/pcap-parser:v0.12.0}
DST_PCAP=${DST_PCAP:-docker.cnb.cool/zara1024/pcap-parser:v0.12.0}
SRC_KSM=${SRC_KSM:-docker.cnb.cool/ongridio/ongrid-edge/kube-state-metrics:v2.16.0}
DST_KSM=${DST_KSM:-docker.cnb.cool/zara1024/opspilot-edge/kube-state-metrics:v2.16.0}
FRONTIER_SRC=${FRONTIER_SRC:-docker.io/singchia/frontier:1.2.6}
FRONTIER_DST=${FRONTIER_DST:-${DST_NS}/frontier:1.2.6}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 2
fi

copy_tag() {
  local src=$1 dst=$2
  local attempt max_attempts=5
  echo "[sync] $src -> $dst"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if docker buildx imagetools create --tag "$dst" "$src"; then
      return 0
    fi
    echo "[sync] attempt $attempt/$max_attempts failed for $dst; retrying..." >&2
    sleep $((attempt * 3))
  done
  echo "[sync] imagetools failed for $dst; trying pull/tag/push fallback" >&2
  if docker pull "$src" \
    && docker tag "$src" "$dst" \
    && docker push "$dst"; then
    return 0
  fi
  echo "[sync] giving up on $dst" >&2
  return 1
}

failed=0

deps=(
  mysql:8.0
  prometheus:v2.54.0
  loki:3.4.0
  tempo:2.10.0
  opentelemetry-collector-contrib:0.157.0
  pyroscope:1.21.1
  qdrant:v1.11.3
  searxng:latest
  grafana-oss:11.1.4
)

for ref in "${deps[@]}"; do
  copy_tag "${SRC_NS}/${ref}" "${DST_NS}/${ref}" || failed=$((failed + 1))
done

copy_tag "$FRONTIER_SRC" "$FRONTIER_DST" || failed=$((failed + 1))
copy_tag "$SRC_PCAP" "$DST_PCAP" || failed=$((failed + 1))
copy_tag "$SRC_KSM" "$DST_KSM" || failed=$((failed + 1))

echo "[sync] finished with $failed failure(s)"
echo "[sync] verify: docker buildx imagetools inspect ${DST_NS}/mysql:8.0"
if ((failed > 0)); then
  exit 1
fi
