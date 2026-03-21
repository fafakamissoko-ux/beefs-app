@echo off
echo ========================================
echo    ARENA VS - Demarrage Rapide
echo ========================================
echo.

echo [1/3] Installation des dependances...
call npm install
if %errorlevel% neq 0 (
    echo Erreur lors de l'installation des dependances
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Verification de la configuration...
if not exist .env.local (
    echo AVERTISSEMENT: Fichier .env.local non trouve
    echo Copiez .env.local.example vers .env.local et configurez vos cles
    echo.
    pause
)

echo.
echo [3/3] Demarrage du serveur de developpement...
echo.
echo Ouvrez http://localhost:3000 dans votre navigateur
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo.

call npm run dev
