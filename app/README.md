# Our Hangout App

This is the current Our Hangout mobile app. It replaces the legacy app while
keeping the Android package and iOS bundle identifier `com.ourhangout` so it can
be distributed as an update.

## Commands

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run test:ai-runtime
npm.cmd run test:backend
npm.cmd start
npm.cmd run android:release
```

The Android release command writes the named APK under
`android/app/build/outputs/release-named/`.

Firebase configuration is read from `android/app/google-services.json`, or from
`OURHANGOUT_ANDROID_GOOGLE_SERVICES_FILE` / `ANDROID_GOOGLE_SERVICES_FILE`.

Use JDK 17 for the Android build. On macOS/Linux, with `JAVA_HOME`, `ANDROID_HOME`,
and Node on `PATH`, run from `app/android`:

```sh
NODE_ENV=production sh ./gradlew :app:assembleRelease --no-daemon
```

If dependency install scripts were skipped, download the on-device AI libraries
from the `app` directory before building:

```sh
node node_modules/llama.rn/install/download-native-artifacts.js
```

The Android build checks for these libraries so an APK cannot silently omit the
on-device AI runtime.

## Diary and pastel navigation

See [통합 일기와 새 화면 구성](DIARY_INTEGRATION.md) for supported Android features, per-account storage, server backups, AI attachment consent, and validation limits.
