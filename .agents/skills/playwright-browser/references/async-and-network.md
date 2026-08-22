# Asynchronous UI, network, and mocking

## Contents

1. Waiting model
2. Navigation and page transitions
3. Request and response synchronization
4. Polling and eventual consistency
5. Mocking policy
6. Downloads, uploads, and streams
7. WebSocket and realtime behavior
8. Failure handling
9. Review checklist

## 1. Waiting model

- Wait for an observable state, never an assumed duration.
- Prefer locator actionability checks built into Playwright.
- Prefer web-first assertions for state that changes after an action.
- Do not use `waitForTimeout` to make a flaky test pass.
- Use a timeout only to bound a meaningful wait.
- Choose the condition closest to the user's success criterion.
- Wait for a visible confirmation when the user sees a confirmation.
- Wait for a response when the contract is an API response.
- Wait for URL change when navigation is the behavior.
- Wait for download when the action creates a download.
- Wait for popup when the action creates a new window.
- Start an event wait before triggering the event.
- Keep the action and event promise adjacent in code.
- Avoid `networkidle` as a universal readiness signal.
- Long-lived polling and analytics can prevent network idle forever.
- Do not wait for all requests when one named response matters.
- Do not treat DOM attachment as visibility.
- Do not treat visibility as enabled actionability.
- Do not treat enabled state as successful submission.
- Assert the final state after the action completes.

## 2. Navigation and page transitions

- Use `page.goto` with the expected page URL.
- Let Playwright's navigation wait handle the normal load lifecycle.
- Use a URL assertion for client-side route changes.
- Pair a click with an explicit navigation promise only when needed.
- Avoid double-waiting for navigation and a redundant load state.
- For redirects, assert the final permitted URL.
- For authentication redirects, distinguish login page from access denial.
- Preserve the original status and redirect evidence when diagnosing.
- For SPA transitions, wait on route or user-visible content.
- For skeleton screens, assert the final content or skeleton removal.
- For lazy sections, scroll the target into view through a locator.
- For hash changes, assert the hash or resulting section.
- For browser back and forward, assert restored application state.
- Do not assume a route change reloads the page.
- Recreate locators when a page or context is replaced.
- Use the new popup page returned by the popup event.
- Do not continue querying the opener for popup content.

## 3. Request and response synchronization

- Define the expected URL or predicate narrowly.
- Start `waitForResponse` before clicking the trigger.
- Validate status, content type, and essential response fields.
- Do not log full private response bodies by default.
- Parse JSON only after confirming the response format.
- Treat HTTP 200 with an error payload according to the application contract.
- Distinguish transport failure from application rejection.
- Distinguish Browser MCP connection failure from target-page HTTP response.
- Record whether the target page was reached.
- Use request inspection to verify payload shape, not secrets.
- Redact authorization, cookies, session IDs, and personal fields.
- Assert idempotent retries only when the product supports them.
- Do not retry non-idempotent writes automatically.
- When response order is nondeterministic, match a stable request key.
- When several requests share a URL, inspect method and safe payload fields.
- Keep response predicates fast and side-effect free.
- Remove route handlers after their test scope ends.
- Use context routes only when every page should share the behavior.

## 4. Polling and eventual consistency

- Use `expect.poll` for a changing non-DOM value.
- Use `expect.toPass` for a bounded repeatable assertion block.
- Set a business-appropriate timeout.
- Use increasing intervals for slow backend convergence.
- Keep every poll idempotent.
- Report the last observed value on failure.
- Stop polling when the success condition is met.
- Stop polling when a terminal error is observed.
- Do not poll an irreversible action.
- Separate action submission from status polling.
- Use a server-provided job ID when available.
- Keep an overall deadline even when individual tool calls have none.
- Avoid nested polling loops.
- Avoid polling both UI and API for the same condition unless diagnosing drift.
- When comparing UI and API, label each source explicitly.
- For pagination, keep seen IDs to detect loops.
- For infinite scroll, bound iterations and item count.
- For queues, assert pending, working, and terminal states separately.

## 5. Mocking policy

- Mock an external dependency when the dependency is outside the test contract.
- Keep the application under test real whenever practical.
- Do not mock the exact behavior the test is supposed to validate.
- Prefer stable API fixtures over intercepting internal implementation calls.
- Fulfill with realistic status, headers, and schema.
- Include failure and latency scenarios intentionally.
- Keep mock data small and understandable.
- Version large fixtures with the contract they represent.
- Avoid copying production personal data into fixtures.
- Redact captured HAR files before storing them.
- Use HAR replay only when its breadth is justified.
- Update HAR deliberately when the API contract changes.
- Fail on unexpected requests when strict isolation is the goal.
- Allow unrelated static resources when they are not under test.
- Do not globally block analytics if the app depends on its initialization.
- Record which dependencies were mocked in the test report.
- Keep real-backend and mocked suites clearly separated.
- Verify that a mock handler was actually used.
- Remove mock handlers after the relevant test.

## 6. Downloads, uploads, and streams

- Start `waitForEvent('download')` before the triggering action.
- Validate suggested filename when it is part of the requirement.
- Save downloads only inside the approved workspace or artifact path.
- Check size and type before parsing a downloaded file.
- Do not execute downloaded binaries.
- Delete temporary downloads when retention is not required.
- Use `setInputFiles` for file inputs.
- Verify accepted files in the UI.
- Generate minimal temporary fixtures for upload tests.
- Keep sensitive user files out of reusable examples.
- For streamed UI, assert incremental state only when it is the behavior.
- Otherwise wait for a terminal marker or final status.
- Do not infer stream completion from a temporary pause.
- Track message or task IDs when concurrent streams interleave.
- Bound retained stream text.
- Preserve explicit error frames.

## 7. WebSocket and realtime behavior

- Identify the socket connection before asserting messages.
- Match messages by task, channel, or entity ID.
- Do not rely on global message order across independent tasks.
- Keep a bounded capture of relevant frames.
- Wait for subscription acknowledgement before publishing test events.
- Assert reconnection only after simulating a defined disconnect.
- Avoid disconnecting the AxOne-managed browser transport itself.
- Distinguish app WebSocket failures from MCP or CDP failures.
- Confirm duplicate suppression for retried messages.
- Confirm terminal state arrives once for each task.
- Use timestamps only as supporting evidence, not sole correlation.
- Test backpressure with bounded workloads.
- Clean up subscriptions created by the test.
- Do not expose private frames in reports.

## 8. Failure handling

- Preserve the failed operation name.
- Preserve the failure stage.
- Preserve the safe native reason.
- State whether a retry was performed.
- Retry only when the operation is idempotent and failure is transient.
- Limit automatic retries.
- Do not switch to an unmanaged browser as silent fallback.
- For MCP startup failure, suggest Browser restart, not website login.
- For target 401 or 403, suggest authentication or access review.
- For selector failure, capture the relevant snapshot.
- For timeout, report the awaited condition.
- For page closure, identify who owned the page.
- For context closure, do not automatically create an unrelated session.
- For malformed response, preserve status and content type.
- For partial results, report inspected scope and uncertainty.
- Never claim that a site is down from a local connection failure.

## 9. Review checklist

- [ ] Every wait has an observable condition.
- [ ] Event waits start before triggering actions.
- [ ] Requests are matched narrowly.
- [ ] Secrets are redacted.
- [ ] Polls are bounded and idempotent.
- [ ] Mocks do not replace the subject under test.
- [ ] Downloads stay in approved paths.
- [ ] Concurrent events are correlated by stable IDs.
- [ ] Retry policy is safe and limited.
- [ ] Failure stage and target reachability are reported.
