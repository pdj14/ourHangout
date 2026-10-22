# Run On iOS Device

Last updated: 2026-04-27

## 0) What can be built from Windows

iOS local builds require macOS and Xcode. On Windows, use EAS cloud build:

1. `cd C:\workspace\ourHangoutFamily\ourHangout`
2. `npm install`
3. Create `.env` from `.env.example`
4. `npx eas-cli login`
5. `npm run build:ios`

The `preview` profile creates an internal iOS build. Installing it on a real iPhone requires Apple signing through EAS and an Apple Developer account.

## 1) Required iOS values

Set these in `.env` before building:

```env
EXPO_PUBLIC_BACKEND_BASE_URL=http://wowjini0228.synology.me:7083
IOS_BUNDLE_IDENTIFIER=com.ourhangout
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=599659668409-jo6tdh99iht1tle9mf089k8ba3en08ou.apps.googleusercontent.com
```

Google login on iOS needs an OAuth Client ID with application type `iOS` and bundle ID matching `IOS_BUNDLE_IDENTIFIER`. Without `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, the app can build but Google login is intentionally disabled on iOS.

## 2) Checks before building

```powershell
npx.cmd expo config --type public
npx.cmd tsc --noEmit
```

The app config automatically adds an iOS App Transport Security exception for the HTTP backend host in `EXPO_PUBLIC_BACKEND_BASE_URL`. If the backend moves to HTTPS, the exception is not added.

## 3) Simulator build

Use this only when you have a Mac that can run the generated simulator app:

```powershell
npm run build:ios:simulator
```
