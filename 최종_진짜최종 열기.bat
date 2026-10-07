@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 최종_진짜최종

rem 이미 켜져 있으면 브라우저만 연다.
curl -s -o nul http://127.0.0.1:5180/ && (start "" http://127.0.0.1:5180/ & exit /b)

where npm >nul 2>nul || (
  echo Node.js 가 없습니다. https://nodejs.org 에서 24 이상을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 한 번 필요한 꾸러미를 설치합니다...
  call npm ci || (pause & exit /b 1)
)

echo 이 창을 닫으면 사이트도 꺼집니다.
call npm run dev -- --open
pause
