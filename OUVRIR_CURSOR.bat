@echo off
echo.
echo ========================================
echo   ARENA VS - Ouverture dans CURSOR
echo ========================================
echo.

cd /d "%~dp0"

:: Essayer différents chemins d'installation de Cursor
set "CURSOR_PATH="

:: Chemin 1: AppData Local
if exist "%LOCALAPPDATA%\Programs\cursor\Cursor.exe" (
    set "CURSOR_PATH=%LOCALAPPDATA%\Programs\cursor\Cursor.exe"
    goto :open
)

:: Chemin 2: Program Files
if exist "%ProgramFiles%\Cursor\Cursor.exe" (
    set "CURSOR_PATH=%ProgramFiles%\Cursor\Cursor.exe"
    goto :open
)

:: Chemin 3: Program Files (x86)
if exist "%ProgramFiles(x86)%\Cursor\Cursor.exe" (
    set "CURSOR_PATH=%ProgramFiles(x86)%\Cursor\Cursor.exe"
    goto :open
)

:: Chemin 4: Essayer via la commande cursor
where cursor >nul 2>&1
if %errorlevel% == 0 (
    echo Ouverture avec la commande 'cursor'...
    cursor .
    goto :end
)

:: Si Cursor n'est pas trouvé
echo.
echo [ERREUR] Cursor n'a pas ete trouve sur votre systeme.
echo.
echo Options :
echo 1. Installez Cursor depuis : https://cursor.sh
echo 2. Ou continuez avec VSCode (tout fonctionne pareil!)
echo.
pause
exit /b 1

:open
echo Ouverture dans Cursor...
echo Chemin : %CURSOR_PATH%
echo.
start "" "%CURSOR_PATH%" "%~dp0"
goto :end

:end
echo.
echo Si Cursor ne s'ouvre pas :
echo 1. Ouvrez Cursor manuellement
echo 2. File ^> Open Folder
echo 3. Selectionnez : %~dp0
echo.
echo OU continuez simplement avec VSCode ! 😊
echo.
timeout /t 5
