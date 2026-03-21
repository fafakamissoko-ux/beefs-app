@echo off
echo.
echo ========================================
echo   ARENA VS - Ouverture dans Cursor
echo ========================================
echo.
echo Ouverture du projet dans Cursor...
echo.

cd /d "%~dp0"
start cursor .

echo.
echo Si Cursor ne s'ouvre pas automatiquement :
echo 1. Ouvrez Cursor manuellement
echo 2. File ^> Open Folder
echo 3. Selectionnez : %~dp0
echo.
pause
