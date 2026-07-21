@echo off
cd /d "%~dp0"
if not exist node_modules npm install
start "" /min npm start
:: Wait for the server to actually accept connections before opening the browser.
set PORT=3000
set TRIES=30
:wait
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:%PORT% -UseBasicParsing -TimeoutSec 1).StatusCode } catch { 0 }" | findstr /r "[0-9]" >nul 2>&1
if not errorlevel 1 goto :open
set /a TRIES-=1
if %TRIES%==0 goto :open
timeout /t 1 >nul
goto :wait
:open
start http://127.0.0.1:%PORT%
