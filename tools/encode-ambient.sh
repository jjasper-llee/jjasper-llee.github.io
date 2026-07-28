#!/bin/bash
# Encode the ambient background loops that sit behind the hero.
#
# Why the grading happens here and not only in CSS:
#   The clip is displayed at a heavily reduced luminance ceiling. If we shipped
#   full-range video and crushed it in CSS, the codec would spend its bitrate on
#   highlights nobody ever sees, and the near-black detail it discarded would
#   band once the range was compressed. Grading first puts the bits where they
#   land on screen. The remaining darkening stays in CSS as a live dial
#   (--video-gain), so the look is still tunable without re-encoding.
#
# Why the cross-wrap:
#   A hard cut every N seconds is the most common ambient-loop failure. We take
#   DUR+XF seconds, then fade the tail back over the head so the last frame
#   matches the first.
#
# Needs ffmpeg (brew install ffmpeg). Masters are NOT committed -- only the
# small outputs in media/ are.
#
# Usage: tools/encode-ambient.sh

set -eu
cd "$(dirname "$0")/.." || exit 1

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
mkdir -p media

CELLO="$HOME/Movies/iMovie Library.imovielibrary/My Movie/Original Media/IMG_7205.mov"
# Arc welding, from the middle of a 104s clip. Better machinery b-roll than
# the lathe: live arc, gloved hands, and no face visible under the helmet.
SHOP="$HOME/Downloads/IMG_7374.MOV"

DUR=12          # loop length in seconds
XF=1            # cross-wrap length folded onto the head

# encode <src> <out-base> <crop> <start> <extra-eq>
encode() {
  local src="$1" out="media/$2" crop="$3" start="$4" eq="$5"

  if [ ! -f "$src" ]; then
    printf '  MISSING  %s\n' "$src"
    return
  fi

  # Adapt the loop length to the source. The lathe clip is only 4s, and asking
  # for a 12s body + 1s tail silently produced an empty tail -- the cross-wrap
  # did nothing and the clip shipped with a hard cut at the loop point.
  local srcdur dur xf
  srcdur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$src" | cut -d. -f1)
  srcdur=$(( srcdur - start ))
  dur=$DUR; xf=$XF
  if [ "$srcdur" -lt $((DUR + XF)) ]; then
    xf=1
    dur=$(( srcdur - xf ))
    [ "$dur" -lt 2 ] && { dur=$srcdur; xf=0; }
    printf '  note %s: source is %ss, looping at %ss\n' "$2" "$srcdur" "$dur"
  fi

  # colorlevels caps the output ceiling at 55%, which is the "luminance ceiling"
  # the CSS then finishes. yuv420p because 10-bit HEVC sources would otherwise
  # produce a file Safari refuses.
  local chain="${crop},scale=1280:-2:flags=lanczos,fps=24,${eq},colorlevels=romax=0.55:gomax=0.55:bomax=0.55,format=yuv420p"

  # No usable tail -> plain encode, no cross-wrap to fake.
  if [ "$xf" -eq 0 ]; then
    ffmpeg -y -hide_banner -loglevel error -ss "$start" -t "$dur" -i "$src" \
      -vf "$chain" -an -sn -dn \
      -c:v libx264 -profile:v high -level:v 4.0 -preset slower \
      -crf 30 -maxrate 1200k -bufsize 2400k -g 48 -keyint_min 48 -sc_threshold 0 \
      -movflags +faststart "${out}.mp4"
    finish "$out"
    return
  fi

  ffmpeg -y -hide_banner -loglevel error \
    -ss "$start" -t $((dur + xf)) -i "$src" \
    -filter_complex "\
[0:v]${chain},split[body][tail];\
[body]trim=0:${dur},setpts=PTS-STARTPTS[b];\
[tail]trim=${dur}:$((dur + xf)),setpts=PTS-STARTPTS,format=yuva420p,fade=t=out:st=0:d=${xf}:alpha=1[t];\
[b][t]overlay=eof_action=pass,format=yuv420p[v]" \
    -map "[v]" -an -sn -dn \
    -c:v libx264 -profile:v high -level:v 4.0 -preset slower \
    -crf 30 -maxrate 1200k -bufsize 2400k \
    -g 48 -keyint_min 48 -sc_threshold 0 \
    -movflags +faststart \
    "${out}.mp4"

  finish "$out"
}

# Mobile variant + poster, shared by both encode paths.
finish() {
  local out="$1"
  # 640-wide for phones. Almost no resolvable detail survives the grading, so
  # this is invisible and halves the transfer on bad networks.
  ffmpeg -y -hide_banner -loglevel error -i "${out}.mp4" -an -vf scale=640:-2 \
    -c:v libx264 -profile:v high -preset slower -crf 32 \
    -maxrate 550k -bufsize 1100k -g 48 -movflags +faststart \
    "${out}.640.mp4"

  # Poster comes from the ENCODED file, not the source. Taking it from the
  # source gives a visible pop when the video swaps in.
  ffmpeg -y -hide_banner -loglevel error -i "${out}.mp4" -frames:v 1 -q:v 6 "${out}.poster.jpg"

  printf '  ok  %-22s %6sKB   mobile %5sKB   poster %4sKB\n' "$(basename "$out")" \
    "$(( $(stat -f%z "${out}.mp4") / 1024 ))" \
    "$(( $(stat -f%z "${out}.640.mp4") / 1024 ))" \
    "$(( $(stat -f%z "${out}.poster.jpg") / 1024 ))"
}

echo "== ambient loops =="

# Cello. Crop lands on torso, both hands, bow and instrument -- the face sits
# above the frame, so no identifiable person ends up on the public site (the
# source is a duo with a second musician).
encode "$CELLO" "ambient-cello" "crop=620:380:230:330" 6 \
  "eq=contrast=1.06:saturation=0.25:gamma=0.94:brightness=-0.04"

# Machinery. Source is portrait (rotation -90 metadata); this band catches the
# arc, the gloves and the fixture table. The arc is blown out by design, so the
# grade only pulls the room down around it.
encode "$SHOP" "ambient-shop" "crop=1080:620:0:520" 46 \
  "eq=contrast=1.12:saturation=0.26:gamma=0.94"

echo
echo "total committed:"
du -ch media/ambient-*.mp4 media/ambient-*.jpg 2>/dev/null | tail -1
