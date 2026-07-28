#!/bin/bash
# Cache the YouTube poster frames for the Right Brain video grid.
#
# Why: index.html embedded 18 live <iframe> players. They escaped lazy-loading
# because display:none gives them no layout box, so opening "Right Brain"
# instantiated all 18 at once -- roughly 8 MB of transfer and 18 nested
# browsing contexts on a single click.
#
# The grid now renders click-to-load facades built from these stills. That also
# means zero requests to Google on page load, which is a privacy win as well as
# a performance one.
#
# Usage: tools/fetch-yt-thumbs.sh

set -eu
cd "$(dirname "$0")/.." || exit 1
mkdir -p media/yt

ids=$(grep -oE 'youtube(-nocookie)?\.com/embed/[A-Za-z0-9_-]{11}' index.html \
      | sed 's|.*/||' | sort -u)

[ -n "$ids" ] || { echo "no video ids found in index.html"; exit 1; }

n=0
for id in $ids; do
  out="media/yt/$id.jpg"
  if [ -f "$out" ]; then
    printf '  have %s\n' "$id"; n=$((n+1)); continue
  fi
  # maxres is not generated for every upload; hq is always present.
  if curl -fsSL "https://i.ytimg.com/vi/$id/maxresdefault.jpg" -o "$out" 2>/dev/null \
     || curl -fsSL "https://i.ytimg.com/vi/$id/hqdefault.jpg" -o "$out" 2>/dev/null; then
    # Downscale to what the grid actually renders. maxres is 1280x720 and the
    # tile is at most 480 wide.
    # 480 wide at q62: the tile renders at ~400px, and 18 of these
    # add up. This is a 4x saving over the source maxres frame.
    sips -Z 480 -s format jpeg -s formatOptions 62 "$out" --out "$out" >/dev/null 2>&1 || true
    printf '  ok   %s  %sKB\n' "$id" "$(( $(stat -f%z "$out") / 1024 ))"
    n=$((n+1))
  else
    printf '  FAIL %s\n' "$id"
  fi
done

echo
printf '%s thumbnails, %s total\n' "$n" "$(du -sh media/yt | cut -f1)"
