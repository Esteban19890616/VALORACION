@echo off
chcp 65001 >nul
title SER INTEGRAL 360 - servidor local
cd /d "%~dp0"
set PUERTO=8360
echo.
echo  SER INTEGRAL 360 - prototipo local
echo  Abra en el navegador:  http://localhost:%PUERTO%
echo  Cierre esta ventana para detener el servidor.
echo.
start "" "http://localhost:%PUERTO%"

where py >nul 2>nul && (py -m http.server %PUERTO% --bind 127.0.0.1 & goto :fin)
where python >nul 2>nul && (python -m http.server %PUERTO% --bind 127.0.0.1 & goto :fin)
where npx >nul 2>nul && (npx --yes http-server -p %PUERTO% -a 127.0.0.1 -c-1 & goto :fin)

echo  No se encontro Python ni Node.js.
echo  Instale Python desde https://www.python.org (marque "Add python.exe to PATH")
echo  y vuelva a ejecutar este archivo.
pause
:fin
