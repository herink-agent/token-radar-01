#!/bin/bash
# Take the three dossier screenshots of the built dashboard with headless Chrome.
# Usage: ./shots.sh <dashboard-dir> <out-dir>
# 1-board.png: the board; 2-detail.png: rank-1 detail dialog; 3-filtered.png: category filter.
set -e
DASH="$1"
OUT="$2"
mkdir -p "$OUT"
BASE="file://$DASH/index.html"
FLAGS="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --no-zygote --disable-crash-reporter --no-crashpad --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000"
google-chrome $FLAGS --screenshot="$OUT/1-board.png" "$BASE" 2>/dev/null
google-chrome $FLAGS --screenshot="$OUT/2-detail.png" "$BASE#p=steakhouse-financial" 2>/dev/null
google-chrome $FLAGS --screenshot="$OUT/3-filtered.png" "$BASE#category=Risk%20Curators" 2>/dev/null
ls -la "$OUT"
python3 -c "
from PIL import Image
import sys
for f in ['1-board.png','2-detail.png','3-filtered.png']:
    im = Image.open('$OUT/'+f)
    print(f, im.size, im.format)
"
