# Run On Android Device

Last updated: 2026-02-28

## Option 1: Fastest Preview (Expo Go)
This app can be checked immediately without building APK.

1. Install Expo Go on your Android device.
2. On PC:
   - `cd C:\workspace\ourHome\kidchat-app`
   - `npm install`
   - `npm run start:tunnel`
3. Scan the QR code from Expo Go.
4. The app opens directly on your phone.

Notes:
- Current app uses local mock chat flow, so relay server is not required to preview UI.
- Tunnel mode is used so local network restrictions are less likely to block connection.
- If your phone is connected by adb, you can open Expo URL automatically:
  - `powershell -ExecutionPolicy Bypass -File .\tools\open-on-adb.ps1`

## Option 2: Build APK (Installable file)
1. `cd C:\workspace\ourHome\kidchat-app`
2. `npx eas-cli login`
3. `npm run build:apk`
4. When build finishes, download the APK link from EAS and install on device.

Notes:
- `eas.json` is already configured with `preview` profile for APK output.
- Cloud build requires Expo account login.
