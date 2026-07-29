#!/bin/bash
# Vendor the planet maps used by universe.html.
# Source: Solar System Scope (CC BY 4.0), built from NASA imagery.
#
# Why vendored rather than hotlinked -- this is the important part:
#   solarsystemscope.com sends NO Access-Control-Allow-Origin header. THREE's
#   TextureLoader sets crossOrigin='anonymous', so the load is rejected outright;
#   and dropping crossOrigin doesn't rescue it either, because texImage2D from a
#   non-CORS cross-origin image throws SecurityError in WebGL. The URLs work
#   fine in an <img>, and not at all as a GPU texture. Same argument as
#   vendoring three.js: the page shouldn't break on someone else's host.
#
# Two upstream traps this script exists to absorb:
#   - there is NO 1k tier upstream (2k/4k/8k only), so the small tiers are
#     generated here with sips
#   - the specular/normal maps ship as TIFF, which no browser can decode
#
# Run once; the output is committed. Usage: tools/fetch-textures.sh

set -eu
cd "$(dirname "$0")/.." || exit 1
mkdir -p textures

SRC=https://www.solarsystemscope.com/textures/download
Q=78    # visually lossless wrapped on a sphere; upstream ships ~q95

total_before=0

# fetch <out-name> <upstream-file> <sizes...>
fetch() {
  local out=$1 up=$2; shift 2
  local tmp="textures/.${out}.src"

  if [ ! -f "$tmp" ]; then
    curl -fsSL "$SRC/$up" -o "$tmp" || { printf '  FAIL %s\n' "$up"; return; }
  fi
  total_before=$(( total_before + $(stat -f%z "$tmp") ))

  for s in "$@"; do
    local dst="textures/${out}_${s}.jpg"
    if [ -f "$dst" ]; then printf '  have %s\n' "$dst"; continue; fi
    # sips reads TIFF natively, so the .tif sources transcode here for free.
    sips -Z "$s" -s format jpeg -s formatOptions $Q "$tmp" --out "$dst" >/dev/null 2>&1
    printf '  ok   %-30s %5sKB\n' "$(basename "$dst")" "$(( $(stat -f%z "$dst") / 1024 ))"
  done
  rm -f "$tmp"
}

echo "== planet + star maps =="

# Earth is the hero, so it alone gets a 2048 tier.
# Earth is the hero and gets a 4K tier. There is NO 4k_* upstream -- Solar
# System Scope ships 2K and 8K only -- so 4K is downscaled from the 8K master
# here, exactly like the 1K and 512 tiers.
fetch earth_day    8k_earth_daymap.jpg        4096 2048 1024 512
fetch earth_night  8k_earth_nightmap.jpg      4096 2048 1024 512
fetch earth_clouds 8k_earth_clouds.jpg        4096 2048 1024
# "specular map" is really a land/water mask. It is DATA, not colour -- it must
# load as NoColorSpace or the ocean highlight comes out the wrong shape.
fetch earth_ocean  2k_earth_specular_map.tif  1024  512

fetch sun          2k_sun.jpg                 1024  512
fetch mercury      2k_mercury.jpg             1024  512
fetch venus        2k_venus_atmosphere.jpg    1024  512
fetch mars         2k_mars.jpg                1024  512
fetch jupiter      2k_jupiter.jpg             1024  512
fetch saturn       2k_saturn.jpg              1024  512
fetch uranus       2k_uranus.jpg              1024  512
fetch neptune      2k_neptune.jpg             1024  512
fetch moon         2k_moon.jpg                1024  512
fetch milkyway     2k_stars_milky_way.jpg     2048 1024

# The ring carries transparency, so it stays PNG. It is only 12KB.
if [ ! -f textures/saturn_ring.png ]; then
  curl -fsSL "$SRC/2k_saturn_ring_alpha.png" -o textures/saturn_ring.png \
    && printf '  ok   %-30s %5sKB\n' "saturn_ring.png" "$(( $(stat -f%z textures/saturn_ring.png) / 1024 ))"
fi

# The Earth normal map is deliberately NOT fetched. At 2048x1024 over a
# 12,742km sphere one texel is 20km, and Earth's tallest relief is 8.8km -- the
# bump is below the noise floor at every framing this page uses. It would cost
# 520KB (and would have to ship as PNG, ~800KB, because JPEG chroma subsampling
# corrupts a tangent-space normal into visible faceting).

echo
printf 'upstream: %s MB   vendored: %s\n' \
  "$(( total_before / 1048576 ))" "$(du -sh textures | cut -f1)"
