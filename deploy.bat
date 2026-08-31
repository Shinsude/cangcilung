@echo off
setlocal

echo =============================================
echo   Deploy cangcilung ke production (Vercel)
echo =============================================
echo.

cd /d "%~dp0"

where npx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js/npm (npx) tidak ditemukan. Pasang dahulu.
  pause
  exit /b 1
)

call npx --no-install vercel whoami >nul 2>&1
if errorlevel 1 (
  echo [INFO] Belum login ke Vercel. Jalankan: npx vercel login
  echo        atau buka https://vercel.com/account/settings/tokens untuk token.
  pause
  exit /b 1
)

echo [INFO] Deploy ke production...
call npx --no-install vercel deploy --prod --yes
set RC=%errorlevel%

echo.
if %RC%==0 (
  echo =============================================
  echo   SUKSES: https://cangcilung.vercel.app
  echo =============================================
) else (
  echo [ERROR] Deploy gagal (kode %RC%). Lihat output di atas.
)

pause
exit /b %RC%
