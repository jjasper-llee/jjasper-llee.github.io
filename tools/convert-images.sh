#!/bin/bash
# Convert web-hostile images to browser-safe, right-sized JPEGs.
#
# Why this exists:
#   - Chrome/Firefox/Edge cannot decode HEIF. Several photos on this site were
#     true HEIC and rendered as broken-image icons for ~85% of visitors.
#   - Many "photos" were stored as full-resolution PNG (up to 5712x4284) and
#     displayed into 180px thumbnails, costing ~69MB on the homepage alone.
#
# Uses macOS-native `sips`, so there is nothing to install.
# Originals are never deleted -- they stay in the repo as archive.
#
# Usage:  tools/convert-images.sh          (from repo root)

set -u
cd "$(dirname "$0")/.." || exit 1

MAX_DIM=1800     # cap on the long edge; nothing on the site displays larger
QUALITY=82       # visually lossless at these dimensions

converted=0
skipped=0
saved_bytes=0

# Convert one file to .jpg, but only keep the result if it is actually smaller.
# Small images get *bigger* when upscaled to MAX_DIM, so we guard against that.
# convert_one <src> [must]
#   "must" = the source format is undecodable in most browsers, so we convert
#   even if the JPEG comes out larger. A 20% bigger file that renders beats a
#   smaller one that shows a broken-image icon. HEIC is a more efficient codec
#   than JPEG, so this genuinely happens (see tennis.heic).
convert_one() {
  local src="$1"
  local must="${2:-}"
  local out="${src%.*}.jpg"

  if [ ! -f "$src" ]; then
    printf '  missing  %s\n' "$src"
    return
  fi

  # macOS is case-insensitive, so `cello.JPG` -> `cello.jpg` would overwrite the
  # source mid-read. Any already-JPEG source gets a distinct -web.jpg name.
  local lower_src lower_out
  lower_src=$(printf '%s' "$src" | tr 'A-Z' 'a-z')
  lower_out=$(printf '%s' "$out" | tr 'A-Z' 'a-z')
  if [ "$lower_src" = "$lower_out" ]; then
    out="${src%.*}-web.jpg"
  fi

  # Never upscale: only pass -Z when the image is genuinely larger than the cap.
  local long_edge
  long_edge=$(sips -g pixelWidth -g pixelHeight "$src" 2>/dev/null \
              | awk '/pixel(Width|Height)/ {print $2}' | sort -rn | head -1)

  if [ -n "$long_edge" ] && [ "$long_edge" -gt "$MAX_DIM" ]; then
    sips -s format jpeg -s formatOptions "$QUALITY" -Z "$MAX_DIM" "$src" --out "$out" >/dev/null 2>&1
  else
    sips -s format jpeg -s formatOptions "$QUALITY" "$src" --out "$out" >/dev/null 2>&1
  fi

  if [ ! -f "$out" ]; then
    printf '  FAILED   %s\n' "$src"
    return
  fi

  local before after
  before=$(stat -f%z "$src")
  after=$(stat -f%z "$out")

  # Keep whichever is smaller -- unless the source format is browser-hostile,
  # in which case rendering correctly outranks byte count.
  if [ "$after" -ge "$before" ] && [ "$must" != "must" ]; then
    rm -f "$out"
    printf '  skipped  %-28s (%sKB -> %sKB, would grow)\n' "$src" "$((before/1024))" "$((after/1024))"
    skipped=$((skipped+1))
    return
  fi

  saved_bytes=$((saved_bytes + before - after))
  converted=$((converted+1))
  printf '  ok       %-28s %6sKB -> %6sKB  (-%s%%)\n' \
    "$src" "$((before/1024))" "$((after/1024))" "$((100 - after*100/before))"
}

echo "== True HEIF images (undecodable in Chrome/Firefox/Edge) =="
for f in \
  IMG_0775.heic origami.heic tennis.heic shrimp.heic IMG_4809.HEIC \
  IMG_0759.heic IMG_0818.heic IMG_0803.heic
do
  convert_one "$f" must
done

echo
echo "== Oversized photos stored as PNG =="
for f in \
  rpicam-servo2.png quadcopter2.png superurop2.png flash_cover2.png \
  quadcopter_noprops.png spider_circuit_depth.png skipoles.png \
  esp32dev.png esp32c3.png bionic_hand2.png circuit_spider2.png \
  intonation_cover.png drone_small2.png transmitter2.png encoder_2motor.png \
  esp32_boards.png FC_esp32_wiring.png flash_combo.png stamp.png
do
  convert_one "$f"
done

echo
echo "== PNG data wearing a .heic extension =="
# These render today only because browsers sniff content and ignore the
# extension. That is fragile: any server sending a strict image/heic
# Content-Type with nosniff would break them. Re-encode to honest .jpg.
for f in \
  hand.heic lumicello.heic fingerboard.heic lumicellos2.heic code.heic \
  scuba2.heic ski.heic knot.heic bearing.heic gear.heic copter_cad.heic \
  pcb.heic copter.heic skipole_mech.heic transmitter.HEIC \
  hand4.heic
do
  convert_one "$f" must
done

echo
echo "== Oversized JPEGs =="
for f in GOPR0051.jpg GOPR0052.jpg "GOPR0053 2.jpg" aquarium.jpg cello.JPG crc2.jpg; do
  convert_one "$f"
done

echo
echo "-----------------------------------------------------------"
printf 'converted: %s   skipped: %s   saved: %s MB\n' \
  "$converted" "$skipped" "$((saved_bytes/1048576))"
