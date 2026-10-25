@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -u videohub_helper.py
pause
