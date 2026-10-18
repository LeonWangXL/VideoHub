@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -m pip install -U "yt-dlp[default]"
echo.
echo yt-dlp installation finished.
echo FFmpeg still needs to be installed separately and available in PATH.
pause
