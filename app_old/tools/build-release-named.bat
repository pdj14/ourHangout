@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0.."
pushd "%ROOT_DIR%" >nul

if not defined ANDROID_GOOGLE_SERVICES_FILE (
  if not exist "%ROOT_DIR%\android\app\google-services.json" (
    echo Missing Firebase Android config.
    echo Set ANDROID_GOOGLE_SERVICES_FILE or place google-services.json in android\app before building.
    popd >nul
    exit /b 1
  )
)

for /f "usebackq delims=" %%I in (`node -e "const { getBuildVersionInfo } = require('./scripts/build-version'); process.stdout.write(getBuildVersionInfo({ rootDir: process.cwd() }).versionName);"` ) do set "BUILD_VERSION=%%I"

if not defined BUILD_VERSION (
  echo Failed to resolve build version.
  popd >nul
  exit /b 1
)

echo Building release APK for version %BUILD_VERSION%...
pushd "%ROOT_DIR%\android" >nul
call gradlew.bat assembleRelease
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
