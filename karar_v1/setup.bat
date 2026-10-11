@echo off
echo.
echo ====================================
echo Karar - Setup
echo ====================================
echo.

npm install
cd client
npm install
cd ..

echo.
echo ✓ Setup complete!
echo.
echo Run: npm run dev
echo.
pause
