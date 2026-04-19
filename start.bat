@echo off
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

set UVICORN=C:\Users\juanm\anaconda3\envs\sam_studio\Scripts\uvicorn.exe
set NPM=C:\Users\juanm\anaconda3\envs\detector_copas\npm.cmd

echo Arrancando SAM Studio...

start "SAM Studio - Backend" cmd /k "set KMP_DUPLICATE_LIB_OK=TRUE && cd /d %BACKEND% && %UVICORN% app.main:app --host 127.0.0.1 --port 8000 --reload"

start "SAM Studio - Frontend" cmd /k "set PATH=C:\Users\juanm\anaconda3\envs\detector_copas;%PATH% && cd /d %FRONTEND% && %NPM% run dev"

echo Esperando a que el backend cargue SAM...
:wait_backend
timeout /t 2 /nobreak >nul
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 goto wait_backend

echo Esperando a que el frontend este listo...
:wait_frontend
timeout /t 2 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 goto wait_frontend

echo Todo listo. Abriendo navegador...
start http://localhost:5173
