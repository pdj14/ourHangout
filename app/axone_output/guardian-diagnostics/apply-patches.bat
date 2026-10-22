@echo off
setlocal EnableExtensions
rem ============================================================
rem  ourHangout guardian diagnostics - patch applier (RETIRED v4)
rem
rem  This script is retired. Since the file-edit MCP became
rem  available, all patches are applied DIRECTLY into src\ and
rem  this folder's src\ copies are NO LONGER kept in sync.
rem
rem  Running an older version of this script would OVERWRITE the
rem  current fixes with outdated copies, so it now does nothing.
rem
rem  To build:
rem     npm run typecheck
rem     npm run android:release
rem ============================================================

echo.
echo [RETIRED] apply-patches.bat no longer copies anything.
echo All patches are already applied directly under src\.
echo Next step:  npm run typecheck
echo Then:       npm run android:release
echo.
pause
exit /b 0
