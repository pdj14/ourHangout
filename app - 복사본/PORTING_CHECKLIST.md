# Our Hangout Renewal Porting Checklist

## Goal

Replace the existing `com.ourhangout` app with the renewal UI while keeping the existing backend, Google account login, user data, rooms, friends, profile data, and chat history.

OpenClaw can remain out of scope. All core chat-app behavior from the original app should be preserved or improved.

## Current Comparison

| Area | Original App | Renewal App Now | Decision |
| --- | --- | --- | --- |
| Android package | `com.ourhangout` | changed toward `com.ourhangout` | Required |
| Backend | `http://wowjini0228.synology.me:7083` | config added, not wired | Required |
| Google login | `@react-native-google-signin/google-signin` + backend `/v1/auth/google` | dependency added, not wired | Required |
| Session | SecureStore + AsyncStorage + refresh token | not wired | Required |
| Demo data | fallback/demo in UI | still present | Remove |
| Room list | `/v1/rooms` | seed list | Required |
| Messages | `/v1/rooms/:id/messages` | local state only | Required |
| Realtime | `WebSocket /v1/ws?token=...` | none | Required |
| Text send | POST message | local append only | Required |
| Image/video send | upload ticket + media complete + message send | none | Required |
| Profile | `/v1/me`, PATCH `/v1/me`, avatar upload | demo profile only | Required |
| Friends | `/v1/friends`, requests, accept/reject | demo people only | Required |
| Family rooms | relationships, member profiles, locations | demo screen only | Required in phases |
| Notifications | Expo notifications/channel | none | Later, after core chat |
| App update/server menu | original has hidden server/update behavior | none | Optional/internal |
| OpenClaw | original has Pobi/OpenClaw logic | none | OpenClaw excluded |

## Required Porting Work

1. Identity and native config
   - Use `com.ourhangout` for Android and iOS bundle id.
   - Keep existing Google OAuth client ids and URL schemes.
   - Keep `usesCleartextTraffic: true` while backend remains HTTP.
   - Regenerate Android native project after config changes.

2. Backend foundation
   - Add a small `services/backend.ts`.
   - Implement `unwrapEnvelope`, `backendRequest`, error normalization, and token refresh.
   - Base URL should come from `app.json extra.backend.baseUrl` or `EXPO_PUBLIC_BACKEND_BASE_URL`.

3. Auth and session
   - Add Google sign-in flow.
   - POST Google token to `/v1/auth/google`.
   - Store `accessToken` and `refreshToken` in SecureStore with AsyncStorage fallback.
   - Restore session on app start.
   - Refresh via `/v1/auth/refresh` on 401.
   - Clear session on logout or invalid refresh.

4. Data model migration
   - Replace seed `User`, `Room`, `Message` with backend-compatible models.
   - Keep UI-friendly view models, but map backend types at the service boundary.
   - Remove `src/data/seed.ts` from runtime.

5. Room and chat
   - Load `/v1/rooms` after login/session restore.
   - Load `/v1/rooms/:id/messages?limit=100` when opening a room.
   - Send text messages with `POST /v1/rooms/:id/messages`.
   - Use optimistic UI with a clear sending/failed state.
   - Mark unread locally when opening rooms; later wire server read receipt if needed.

6. Realtime
   - Connect to `ws://wowjini0228.synology.me:7083/v1/ws?token=...`.
   - Handle `message.new` and `message.delivery`.
   - Reconnect with backoff.
   - Avoid duplicate messages by message id.

7. Image and video
   - Use `expo-image-picker` for image/video selection.
   - Use original upload flow:
     - `POST /v1/media/upload-url`
     - binary upload with `FileSystem.uploadAsync`
     - `POST /v1/media/complete`
     - `POST /v1/rooms/:id/messages` with `kind: image | video`
   - Render images inline with tap-to-preview later.
   - Render videos with `expo-video`, with a lightweight thumbnail/placeholder first.
   - Show upload progress, cancel, retry, and failed-send state.

8. Profile and account
   - Load `/v1/me`.
   - Edit display name/status.
   - Pick/crop profile photo, upload as media, PATCH `/v1/me`.
   - Preserve existing profile data from server.
   - Logout clears local session only, not account data.

9. Friends and people
   - Load `/v1/friends`.
   - Load `/v1/friends/requests`.
   - Support accept/reject.
   - Support friend search/add if original endpoint is kept.
   - Let people screen start or open 1:1 rooms.

10. Family features
   - Load family rooms from `/v1/rooms`.
   - Load member profiles and relationships for family rooms.
   - Support location-sharing preference from `/v1/me`.
   - Location refresh/view can be second phase after chat/media are stable.

## Improvements To Apply While Porting

- Split the original single large `App.tsx` behavior into services, hooks, and screens.
- Keep demo fallback out of production flow; use empty/loading/error states instead.
- Add clear offline/connecting/syncing UI states.
- Make media attachments more predictable than original: preview before send, retry failed upload, and show upload state in the composer.
- Keep room/message mapping defensive so backend field drift does not crash the app.
- Avoid UI blocking during initial sync; load rooms first, messages on demand.
- Add lightweight local cache later, but server remains source of truth.
- Keep OpenClaw out of renewal unless explicitly re-scoped.

## Suggested Implementation Order

1. Native identity/config and dependencies.
2. Auth/session/backend client.
3. Remove demo runtime and show real login/session restore.
4. Rooms and text chat.
5. WebSocket realtime.
6. Image/video send and render.
7. Profile edit and avatar upload.
8. Friends/requests.
9. Family room details and location settings.
10. Polish, permissions, APK build, real-device verification.

## Verification Checklist

- `npm run typecheck`
- `npx expo config --type public`
- Android prebuild has package `com.ourhangout`.
- Install over existing `com.ourhangout` app.
- Login with existing Google account.
- Existing rooms appear.
- Existing chat history appears.
- Text send reaches another client.
- Image send works.
- Video send works.
- Profile photo update persists after app restart.
- WebSocket receives messages without manual refresh.
- Logout and re-login preserve server data.
