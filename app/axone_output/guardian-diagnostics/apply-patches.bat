@echo off
setlocal EnableExtensions
set "SRC=%~dp0src"
set "DST=%~dp0..\.."

echo ==============================================
echo  OurHangout guardian-diagnostics patch apply
echo ==============================================
echo.
echo From: %SRC%
echo To  : %DST%\src
echo.

if not exist "%SRC%\services\debugMode.ts" (
  echo [ERROR] Patch source not found.
  echo Keep this .bat inside axone_output\guardian-diagnostics\
  pause
  exit /b 1
)

copy /Y "%SRC%\services\aiProviders\openAiCompatibleTransport.ts" "%DST%\src\services\aiProviders\" || goto :fail
copy /Y "%SRC%\services\guardianConversation.ts"                  "%DST%\src\services\"               || goto :fail
copy /Y "%SRC%\services\debugMode.ts"                             "%DST%\src\services\"               || goto :fail
copy /Y "%SRC%\screens\OnDeviceAiScreen.tsx"                      "%DST%\src\screens\"                || goto :fail
copy /Y "%SRC%\screens\ProfileScreen.tsx"                         "%DST%\src\screens\"                || goto :fail

echo.
echo [OK] 5 files applied to src.
echo.
echo Next steps:
echo   cd /d "%DST%"
echo   npm run typecheck
echo   npm run android:release
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Copy failed. Check the paths above.
pause
exit /b 1
