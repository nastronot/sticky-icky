#!/usr/bin/env bash
# Re-generate the PNG icon set from favicon.svg.
#
# Requires: librsvg2-bin (provides `rsvg-convert`).
# On Arch:   sudo pacman -S librsvg
# On Debian: sudo apt install librsvg2-bin
#
# Run from anywhere — the script cd's to its own directory.

set -euo pipefail
cd "$(dirname "$0")"

rsvg-convert -w 192 -h 192 favicon.svg -o favicon-192.png
rsvg-convert -w 512 -h 512 favicon.svg -o favicon-512.png
rsvg-convert -w 180 -h 180 favicon.svg -o apple-touch-icon.png

echo "Generated:"
ls -lh favicon-192.png favicon-512.png apple-touch-icon.png
