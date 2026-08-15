@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
pushd "%ROOT_DIR%" >nul

for /f "usebackq delims=" %%I in (`node -e "process.stdout.write(require('./scripts/build-version').getBuildVersionInfo({ rootDir: process.cwd() }).versionName);"`) do set "BUILD_VERSION=%%I"

if not defined BUILD_VERSION (
  echo Failed to resolve build version.
  popd >nul
  exit /b 1
)

echo Building release APK for version %BUILD_VERSION% from %ROOT_DIR% ...
pushd "%ROOT_DIR%\android" >nul
set "NODE_ENV=production"
call gradlew.bat :app:assembleRelease --no-daemon
set "GRADLE_EXIT=%ERRORLEVEL%"
popd >nul

if not "%GRADLE_EXIT%"=="0" (
  echo Release build failed.
  popd >nul
  exit /b 1
)

set "SOURCE_APK=%ROOT_DIR%\android\app\build\outputs\apk\release\app-release.apk"
set "TARGET_DIR=%ROOT_DIR%\android\app\build\outputs\release-named"
set "TARGET_APK=%TARGET_DIR%\ourhangout_%BUILD_VERSION%-release.apk"

if not exist "%SOURCE_APK%" (
  echo Release APK not found: %SOURCE_APK%
  popd >nul
  exit /b 1
)

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
copy /Y "%SOURCE_APK%" "%TARGET_APK%" >nul
if errorlevel 1 (
  echo Failed to copy APK to %TARGET_APK%
  popd >nul
  exit /b 1
)

echo.
echo Built APK:
echo %TARGET_APK%

popd >nul
exit /b 0
