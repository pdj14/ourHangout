# BE + Google Login Verification Checklist

Last updated: 2026-03-02

## 1. Backend Basic Health
1. Confirm backend URL in `app.json`:
   - `expo.extra.backend.baseUrl = http://wowjini0228.synology.me:7083`
2. Verify backend is reachable from device network:
   - `GET /health`
   - `GET /ready` (if enabled on backend)
3. Launch app and confirm login screen backend status shows "connected".

## 2. Google Cloud OAuth Setup
1. Confirm Android OAuth client exists for package `com.ourhangout`.
2. Confirm SHA-1 fingerprint is registered (debug and release if needed).
3. Confirm OAuth consent screen is published/test-user configured.
4. Set client IDs in `app.json`:
   - `expo.extra.googleAuth.androidClientId`
   - `expo.extra.googleAuth.webClientId` (recommended)

## 3. App-side Google Login Flow
1. Tap `Continue with Google`.
2. Complete account selection and consent.
3. Confirm app calls `POST /v1/auth/google` on backend.
4. Confirm backend returns:
   - `accessToken`
   - `refreshToken`
   - `user` object
5. Confirm app proceeds to setup screen without local mock fallback.

## 4. Initial Data Sync After Login
1. Verify app requests:
   - `GET /v1/me`
   - `GET /v1/friends`
   - `GET /v1/rooms`
2. Confirm profile/friend/room data is rendered from backend.
3. Confirm no crash when any endpoint returns empty data.

## 5. Failure Cases To Check
1. Backend down:
   - login button should be disabled or show backend error message.
2. Google token missing/invalid:
   - app should show backend auth error.
3. Backend auth success but sync failure:
   - app should show sync warning and keep session-safe behavior.

## 6. Next Integration Steps (After Login Verification)
1. Wire room message APIs:
   - `GET /v1/rooms/:roomId/messages`
   - `POST /v1/rooms/:roomId/messages`
   - `POST /v1/rooms/:roomId/read`
2. Add token refresh path:
   - `POST /v1/auth/refresh`
3. Add WebSocket session:
   - `GET /v1/ws?token=<accessToken>`
