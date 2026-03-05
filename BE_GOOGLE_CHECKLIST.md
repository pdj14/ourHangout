# BE + Google Login Verification Checklist

Last updated: 2026-03-05

## 1. Backend Basic Health
1. Confirm backend URL in `.env`:
   - `EXPO_PUBLIC_BACKEND_BASE_URL=http://wowjini0228.synology.me:7083`
2. Check resolved app config:
   - `npm run config:check`
   - verify `extra.backend.baseUrl` is the expected URL
3. Verify backend is reachable from device network:
   - `GET /health`
   - `GET /ready` (if enabled on backend)
4. Launch app and confirm login screen backend status shows "connected".

## 2. Google Cloud OAuth Setup
1. Confirm Android OAuth client exists for package `com.ourhangout`.
2. Confirm SHA-1 fingerprint is registered (debug and release if needed).
3. Confirm OAuth consent screen is published/test-user configured.
4. Set client IDs in `.env`:
   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (recommended)

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
