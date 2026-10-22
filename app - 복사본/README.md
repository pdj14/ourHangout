# Our Hangout App

This is the current Our Hangout mobile app. It replaces the legacy app while
keeping the Android package and iOS bundle identifier `com.ourhangout` so it can
be distributed as an update.

## Commands

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd start
npm.cmd run android:release
```

The Android release command writes the named APK under
`android/app/build/outputs/release-named/`.

Firebase configuration is read from `android/app/google-services.json`, or from
`OURHANGOUT_ANDROID_GOOGLE_SERVICES_FILE` / `ANDROID_GOOGLE_SERVICES_FILE`.
