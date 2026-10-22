# Improvement Tracker

## Implemented

- Runtime configuration, native bridges, app utilities, and realtime transport
  are separated from the main app component.
- Read-only API requests run concurrently while mutations keep their ordering.
- Initial friend and room synchronization runs in parallel.
- Native sessions are stored only in SecureStore, with migration from the old
  AsyncStorage fallback.
- Realtime connections stop in the background, reconnect with backoff, and
  refresh authoritative data when the app returns to the foreground.
- Notification deep links open the matching room after authentication and room
  synchronization complete.
- Failed text messages can be retried with the same client message ID.
- Chat rooms show an unread divider, follow new messages near the bottom, and
  provide full-screen image viewing and attachment previews.
- Friend search and friend requests use the backend contracts from the legacy
  app.
- Room favorite and mute settings are editable with optimistic rollback.
- Loading states are scoped to the action that owns them.
- List cells are memoized and virtualized with bounded render windows.
- Navigation and icon actions have accessibility labels and states.
- The visual system uses warm neutral surfaces, forest teal actions, a 16 px
  body size, readable contrast, and fewer repeated explanations.
- Local model initialization, generation, and disposal share an exclusive
  lifecycle; disposal waits for interrupted generation to settle.
- Prompt fitting counts the model's formatted chat tokens and reserves room
  for the answer. Memory checks and CPU limits adapt loading to device capacity.
- GGUF copies validate their header, support cancellation, and clean up partial
  files. Memory pressure and extended background time release local models.
- Stream updates are throttled and Guardian message rows are memoized.
- Network cancellation remains connected after response headers; idle stream
  reads and backend response bodies have deadlines.
- Conversation saves and archive updates are serialized to preserve write order.
- AI lifecycle, streaming cancellation, conversation persistence, and backend
  failure paths have deterministic regression coverage.
- Unused Android media, microphone, overlay, camera, and storage permissions are
  blocked; application backup is disabled.

## Recommended Next

1. Split authentication, room/message state, people, and location into domain
   hooks or stores so `App.tsx` becomes composition-only.
2. Add cursor-based message history loading once the backend exposes a stable
   cursor contract.
3. Port room invitations, member roles, ownership transfer, leave, and delete
   flows from the legacy app.
4. Add an encrypted offline cache for recent room metadata and messages.
5. Add image thumbnail generation and a disk cache for media-heavy rooms.
6. Add API contract tests, reducer tests, and Android UI smoke tests in CI.
7. Add privacy-safe crash reporting and request performance telemetry.
8. Move the backend to HTTPS and then disable cleartext Android traffic.
9. Add an authenticated update channel or store-based update flow instead of
   granting broad package-install permission by default.
