# Run On Android Device

Last updated: 2026-03-05

## 0) Prepare environment

1. `cd C:\workspace\ourHangoutFamily\ourHangout`
2. Create `.env` from `.env.example`
3. Set `EXPO_PUBLIC_BACKEND_BASE_URL` to your Synology backend URL
   - Example: `http://wowjini0228.synology.me:7083`
4. If needed, update Google OAuth client IDs in `.env`

## 1) Fastest preview (Expo Go)

1. Install Expo Go on your Android device.
2. On PC:
   - `cd C:\workspace\ourHangoutFamily\ourHangout`
   - `npm install`
   - `npm run start:tunnel`
3. Scan the QR code from Expo Go.
4. App opens on your phone.

Notes:
- Login screen checks backend `/health` before Google login.
- If backend is down or unreachable, Google login is disabled.
- If your phone is connected with adb, you can open Expo URL automatically:
  - `powershell -ExecutionPolicy Bypass -File .\tools\open-on-adb.ps1`

## 2) Build APK (EAS cloud build)

1. `cd C:\workspace\ourHangoutFamily\ourHangout`
2. `npm install`
3. `npx expo config --type public`
4. `npx eas-cli login`
5. `npm run build:apk`
6. Download generated APK from EAS and install.

Notes:
- `eas.json` already has `preview` profile for APK output.
- Build uses values from `.env` through `app.config.ts`.
- Cloud build requires Expo account login.
