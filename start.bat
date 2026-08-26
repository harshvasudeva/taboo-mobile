@echo off
echo.
echo ========================================
echo   Starting Taboo Multiplayer Game
echo ========================================
echo.
echo Starting Backend Server (Port 3000)...
start cmd /k "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak > nul

echo.
echo Starting Frontend Server (Port 3001)...
start cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo   Servers are starting...
echo ========================================
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:3001
echo.
echo Open http://localhost:3001 in your browser!
echo.
echo Press any key to close this window...
pause > nul
