#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 -m pip install -U "yt-dlp[default]"
printf '\n%s\n' "yt-dlp installation finished."
printf '%s\n' "FFmpeg still needs to be installed separately and available in PATH."
