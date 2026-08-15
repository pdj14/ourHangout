# Original App Review For Renewal

## Review Scope

This review focuses on the original app's core behavior that must be preserved in the renewal app:

- Google login and session restore
- Backend request and refresh-token flow
- Room list, messages, and WebSocket realtime
- Text, image, video, and profile-photo media flow
- Friends, family, notifications, and location features
- Stability and performance issues caused by app structure

## High Priority Findings

### 1. Expo/RN dependency versions are behind the SDK 55 compatibility set

`npx expo install --check` reports many mismatches, including `expo`, `react-native`, `expo-notifications`, `expo-secure-store`, `expo-image-picker`, `expo-video`, and location/task modules.

Impact:

- Native runtime bugs can appear even when TypeScript passes.
- This is a likely contributor to intermittent login, media, notification, or Android build instability.
- Renewal should start from SDK-compatible versions and keep them locked.

Renewal action:

- Run `npx expo install --fix` or explicitly align all Expo modules before native prebuild.
- Keep `package-lock.json` committed and avoid mixed SDK patch levels.
- Add `typecheck` and `config:check` scripts to renewal and root if still maintained.

### 2. The original app is a single very large stateful component

Most behavior lives in `App.tsx`: API client, auth/session, WebSocket, media upload, friends, rooms, family/location, Pobi/OpenClaw, notifications, and UI.

Impact:

- State changes in unrelated domains can trigger expensive re-renders.
- Side effects are hard to reason about and easy to duplicate.
- Renewal work is risky if copied wholesale.

Renewal action:

- Split into:
  - `services/backend.ts`
  - `services/session.ts`
  - `services/media.ts`
  - `hooks/useAuthSession.ts`
  - `hooks/useRooms.ts`
  - `hooks/useRoomMessages.ts`
  - `hooks/useRealtime.ts`
  - `features/profile`, `features/friends`, `features/family`
- Keep screen components mostly presentational.

### 3. Session restore can show the app before backend sync completes

The restore flow calls `finishRestoreUi()` before `syncInitialFromBackend()` completes.

Impact:

- User may see stale cached rooms/profile first.
- If backend sync later partially fails, UI can appear logged in with incomplete data.
- This can feel like "login sometimes does not work".

Renewal action:

- Use explicit auth states: `checking`, `signedOut`, `restoring`, `ready`, `degraded`, `expired`.
- Show cached data only with a visible syncing state.
- Do not silently continue after critical `/v1/me` or `/v1/rooms` failure unless the user is told it is offline/cache mode.

### 4. Global `Alert.alert` is monkey-patched to recover sessions

The original replaces `Alert.alert` globally to suppress session-invalid messages and trigger recovery.

Impact:

- Any unrelated alert containing matching text can be swallowed.
- Behavior is hard to test and can hide real errors.
- It couples UI alerts to auth recovery.

Renewal action:

- Move session-invalid handling into `backendRequest`.
- Emit a typed auth event or set global auth state.
- Keep UI alerts as pure UI, not control flow.

### 5. Backend requests have no timeout or cancellation

`fetch()` calls and uploads rely on platform defaults. Room sync, login, media upload, and health checks can hang or overlap.

Impact:

- Slow network can freeze login or send flows.
- Repeated retries can stack under flaky connectivity.
- A navigation away from a room does not cancel in-flight work.

Renewal action:

- Add request timeout via `AbortController`.
- Add per-domain request dedupe where appropriate.
- Track request keys for rooms/messages so stale responses cannot overwrite newer data.
- Surface retry UI for login/send/upload.

### 6. WebSocket reconnect is fixed at 1.5 seconds

The reconnect loop schedules retry every 1.5 seconds after close.

Impact:

- Under server outage or bad network, many devices may hammer the server.
- Battery and radio usage can increase.
- It competes with the 10-second polling fallback.

Renewal action:

- Use exponential backoff with jitter.
- Reset backoff only after stable connection.
- Pause reconnect while app is backgrounded unless push/location needs require otherwise.

### 7. Fallback/demo send path still exists

If no token exists, `send()` creates local messages, fake delivery changes, and fake replies.

Impact:

- In a production replacement app, this can create false confidence that messages were sent.
- Users can type and see fake chat when they are actually unauthenticated.

Renewal action:

- Remove demo send path entirely.
- Disable composer unless authenticated and room is synced.
- Store failed outgoing messages only as explicit local drafts with retry.

## Medium Priority Findings

### 8. Media upload lacks progress, retry, and compression policy

Image/video/profile uploads use the upload-ticket flow, but there is no visible progress, no retry queue, and quality is set high.

Impact:

- Large videos/images can feel stuck.
- Upload failures discard context too easily.
- Mobile data usage can be high.

Renewal action:

- Add attachment preview state: `picked`, `compressing`, `uploading`, `sending`, `failed`, `sent`.
- Compress/resize images before upload; cap profile/avatar output size.
- For videos, enforce duration and size limits before upload.
- Add retry and remove controls for failed attachments.

### 9. Message merging is O(n*m) for incoming batches

`mergeRoomMessages()` scans the existing message array with `findIndex` for every incoming message, then sorts.

Impact:

- Fine for small rooms, but expensive for long histories or repeated refreshes.

Renewal action:

- Use a `Map<messageId, Message>` for merge.
- Keep room messages normalized internally and derive sorted arrays with memoization.
- Add pagination instead of always refreshing 100-message slices.

### 10. App snapshot persistence is very broad

The app writes profile, friends, bots, rooms, tab state, and read cutoffs to AsyncStorage whenever many UI states change.

Impact:

- Frequent storage writes can add jank on low-end devices.
- Snapshot format can become stale across app versions.

Renewal action:

- Persist only minimal cache: auth session, last room list, selected settings.
- Debounce writes.
- Version cache schema and discard incompatible snapshots.

### 11. Health check retry and restore are loosely coupled

Backend health retries every 10 seconds. Session restore starts only once and can leave the app in a mixed state if backend readiness changes later.

Impact:

- Recovery from server outage may require app restart or manual action.
- Login screen messages can be misleading.

Renewal action:

- Use one connection state machine.
- When backend changes from `error` to `ready`, retry session restore if a stored session exists.
- Separate server-down from auth-expired.

### 12. Room read syncing can trigger overlapping calls

There are multiple effects that can sync read state or messages on app foreground, active room changes, unread updates, and polling fallback.

Impact:

- Duplicate network calls.
- Race conditions around unread counts and read receipts.

Renewal action:

- Centralize read-state sync in `useRoomReadState(roomId)`.
- Debounce mark-read calls.
- Make server read receipt the source of truth after local optimistic update.

### 13. OpenClaw/Pobi logic increases core chat complexity

The original app keeps Pobi/OpenClaw state and UI in the same file as core chat.

Impact:

- More state changes and side effects even when the renewal scope does not need OpenClaw.

Renewal action:

- Exclude OpenClaw from renewal core.
- If Pobi remains, isolate it as a separate optional feature module.

## Lower Priority / Polish Opportunities

### 14. Notifications and location permissions are requested inside broad app logic

Push, location, and background tasks are tightly coupled to the main app flow.

Renewal action:

- Ask permissions at contextual moments.
- Keep background location out of initial chat MVP unless family location is enabled.
- Add clear user-facing location-sharing state.

### 15. Current package lacks a root `typecheck` script

`npx tsc --noEmit` passes, but `npm run typecheck` fails because the script does not exist.

Renewal action:

- Add scripts:
  - `typecheck`
  - `config:check`
  - `android:release`
  - `android:install`

## What Renewal Should Do Better

### Architecture

- Build as a real client around backend contracts, not a single all-in-one component.
- Keep demo data out of runtime.
- Use typed service boundaries for backend payloads.
- Use feature modules so chat, profile, friends, family, and media can evolve independently.

### Stability

- Explicit auth/session state machine.
- Request timeout and cancellation.
- Exponential backoff for WebSocket and health checks.
- Offline/degraded UI states instead of silent partial sync.
- Centralized error normalization.

### Performance

- Normalize rooms/messages/friends in state.
- Memoize derived room lists.
- Paginate messages.
- Avoid broad AsyncStorage writes.
- Render media thumbnails instead of full heavy media where possible.

### Media UX

- Image/video preview before send.
- Upload progress and retry.
- Size/duration validation before upload.
- Profile photo crop with final compressed output.
- Tap-to-view image/video with save/share later.

### Migration Safety

- Use package id `com.ourhangout` only when ready to replace the existing app.
- Keep backend and Google OAuth ids unchanged.
- Verify login with an existing account.
- Verify existing rooms/messages before removing demo fallback.
- Build debug and release APKs, install over existing app, and inspect logcat after launch.
