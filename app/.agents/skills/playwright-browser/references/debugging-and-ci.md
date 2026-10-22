# Debugging, observability, CI, and performance

## Contents

1. Failure triage
2. Evidence ladder
3. Trace workflow
4. Flake diagnosis
5. CI design
6. Sharding and parallelism
7. Performance checks
8. Reporting
9. Review checklist

## 1. Failure triage

Classify the failure before changing code:

1. AxOne Browser or MCP connection failure.
2. Target-site authentication or authorization failure.
3. Test environment or dependency failure.
4. Application defect.
5. Test defect.
6. Data collision or isolation defect.
7. Timing or eventual-consistency issue.
8. Browser-specific behavior.
9. Infrastructure resource exhaustion.
10. Unknown with insufficient evidence.

Then:

- Reproduce the smallest affected test or action.
- Read the first meaningful error, not only the final timeout.
- Identify the last confirmed successful state.
- Inspect the current snapshot near the failure.
- Check the asserted locator and expected state.
- Check relevant console errors.
- Check the named request or response.
- Escalate to a trace when earlier evidence is insufficient.
- Change one cause at a time.
- Re-run the smallest test after the fix.
- Run representative neighboring coverage before completion.
- Do not increase timeouts before identifying the awaited condition.
- Do not loosen assertions before confirming product intent.

## 2. Evidence ladder

Use the cheapest useful evidence first:

1. Error message and stack.
2. Test step and expected state.
3. Bounded accessibility snapshot.
4. Focused screenshot.
5. Relevant console messages.
6. Relevant request and response metadata.
7. Trace viewer.
8. Video only when motion or sequence cannot be reconstructed.
9. Full diagnostic bundle only for unresolved cases.

Rules:

- Do not dump the entire DOM into the prompt.
- Do not attach every screenshot from a successful run.
- Retain failure evidence according to repository policy.
- Keep trace paths in artifacts, not pasted into chat.
- Report exact artifact paths when created.
- Redact tokens, cookies, and private content.
- Capture before destructive cleanup.
- Prefer a focused reproduction over large suite logs.
- Include browser, project, retry, and worker identifiers.
- Include the effective base URL without credentials.

## 3. Trace workflow

- Enable trace according to project policy, commonly on first retry.
- Do not collect every trace forever by default.
- Open the trace for the failing test and retry.
- Inspect action timeline and locator resolution.
- Compare DOM snapshot before and after the failed action.
- Inspect network events tied to the action.
- Inspect console errors near the timestamp.
- Check whether the element was visible, stable, enabled, and unobscured.
- Check whether navigation replaced the page.
- Check whether a popup or frame owned the target.
- Check whether data differed between retries.
- Extract the minimal causal evidence.
- Store the trace as an artifact when the user needs it.
- Do not paste binary trace content into model context.
- Remove obsolete traces according to retention policy.

## 4. Flake diagnosis

- Repeat only the failing test with controlled count.
- Vary worker count to expose shared-state collisions.
- Run headed only when visual timing helps diagnosis.
- Compare local and CI environment variables safely.
- Inspect resource limits and process crashes.
- Check time zone, locale, viewport, and reduced-motion differences.
- Check order dependence by shuffling or isolated execution.
- Check generated identifiers for collision.
- Check cleanup races.
- Check background polling and animations.
- Check unawaited promises in test helpers.
- Check event waits created after the triggering action.
- Check broad locators that resolve differently over time.
- Check exact text that changes with data or locale.
- Check service worker and cache state.
- Check retries for duplicate non-idempotent writes.
- Fix the cause; do not hide it with arbitrary sleeps.
- Keep a regression test for the identified race.

## 5. CI design

- Install dependencies from the lockfile.
- Install the matching Playwright browser build.
- Install required Linux system dependencies in CI images.
- Cache dependencies carefully; do not cache mutable browser state.
- Use a stable base image or documented runner.
- Start required services with explicit health checks.
- Keep secrets in the CI secret store.
- Mask secrets in logs and artifacts.
- Fail clearly when a required environment variable is absent.
- Use a deterministic test command.
- Preserve failure traces, screenshots, and reports.
- Set artifact retention explicitly.
- Keep the HTML report as an artifact, not a long console dump.
- Use retries primarily on CI when evidence collection benefits.
- Keep local reproduction commands documented.
- Separate smoke, full regression, and specialized suites.
- Gate merges on a bounded critical suite.
- Schedule expensive cross-browser or visual suites appropriately.
- Avoid relying on a developer's interactive AxOne Browser in CI.
- Use the repository's test runner for CI, not Browser Automation history.

## 6. Sharding and parallelism

- Parallelize isolated tests.
- Namespace records by shard and worker.
- Keep setup projects safe under parallel startup.
- Avoid writing all workers to one file.
- Use unique artifact output directories.
- Merge reports through supported tooling.
- Keep shard count proportional to available CPU and service capacity.
- More workers can increase backend contention and flakiness.
- Measure before raising workers.
- Keep serial groups narrow.
- Do not share mutable storage state across roles.
- Make rate limits visible in configuration.
- Back off safely on read-only transient requests.
- Do not auto-retry destructive requests.
- Correlate logs with project, shard, worker, test, and retry.
- Ensure a failed shard still uploads artifacts.

## 7. Performance checks

- Define whether the goal is regression detection or profiling.
- Use stable environments for numeric thresholds.
- Warm up when the metric requires it.
- Measure multiple samples.
- Prefer percentiles to one outlier-prone sample.
- Separate browser startup from page interaction when relevant.
- Record viewport, browser, network, and CPU conditions.
- Avoid tight thresholds on shared CI machines.
- Track navigation and user-action timing separately.
- Use tracing or browser metrics only as supported by the version.
- Do not claim lab measurements equal real-user monitoring.
- Keep performance collection bounded.
- Store time series outside normal assertion output when large.
- Fail only on an agreed regression threshold.
- Report confidence and variability.

## 8. Reporting

- Lead with pass, fail, blocked, or inconclusive.
- Name the tested scope.
- Name browsers and projects used.
- List failed tests with concise causes.
- Separate product defects from test defects.
- Link artifacts with paths or CI URLs.
- State retries and whether they passed.
- State skipped coverage and why.
- Preserve the first failure even if cleanup also fails.
- Do not expose credentials or private page content.
- Keep raw logs in artifacts; summarize in chat.
- Include a local reproduction command when useful.
- Include remaining uncertainty.

## 9. Review checklist

- [ ] Failure classification precedes changes.
- [ ] Evidence escalated progressively.
- [ ] Trace collection is bounded.
- [ ] Flake cause was fixed rather than slept over.
- [ ] CI installs matching browsers and dependencies.
- [ ] Parallel execution is data-safe.
- [ ] Artifacts are retained and redacted.
- [ ] Performance claims include conditions.
- [ ] Report separates app, test, and infrastructure failures.
- [ ] The smallest relevant verification passed.
